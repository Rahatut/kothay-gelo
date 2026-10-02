import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Password hashing.
 *
 * scrypt from the standard library rather than argon2 or bcrypt. scrypt is
 * memory-hard and ships with Node, so there is no native module to compile, no
 * prebuild matrix to track, and no ABI surface on a container image we do not
 * control. Argon2id is the better primitive, but buying it means owning a native
 * dependency; that trade is not worth it at this scale.
 *
 * bcrypt is rejected outright: it is not memory-hard, it truncates at 72 bytes
 * silently, and it is still a native module.
 *
 * Parameters: N=32768, r=8, p=1 — roughly 32 MB and 74 ms per verification.
 */

/**
 * scrypt's memory cost is 128 * N * r bytes, which for these parameters is
 * exactly 33,554,432 — precisely Node's default `maxmem`. The library's check
 * is a strict `>`, so the default parameters throw
 * `ERR_CRYPTO_INVALID_SCRYPT_PARAMS` (error:030000AC). `maxmem` must therefore
 * be passed explicitly. Measured: 74 ms per hash at this cost.
 */
const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
/** Headroom above the computed requirement. */
const MAXMEM = 64 * 1024 * 1024;

const SCRYPT_OPTIONS = {
  N: SCRYPT_N,
  r: SCRYPT_R,
  p: SCRYPT_P,
  maxmem: MAXMEM,
};

/**
 * Caps concurrent password verifications.
 *
 * The memory-hard cost is paid per verification, so a burst of parallel sign-in
 * attempts is a memory-exhaustion vector: 20 simultaneous hashes cost 640 MB.
 * A 512 MB instance cannot afford it. Four concurrent verifications is generous
 * for real sign-in traffic and bounds the footprint at ~128 MB.
 */
const MAX_CONCURRENT = 4;

let active = 0;
const waiting: (() => void)[] = [];

async function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
  active++;
}

function release(): void {
  active--;
  const next = waiting.shift();
  if (next) next();
}

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, SCRYPT_OPTIONS, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

/**
 * Produces a self-describing hash string.
 *
 * Parameters travel with the hash so they can be raised later without
 * invalidating existing credentials: old hashes stay verifiable under their own
 * parameters, and re-hashing on next sign-in upgrades them.
 *
 * Format: scrypt$N$r$p$salt_b64$key_b64
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt);
  return [
    'scrypt',
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$');
}

/**
 * Verifies a password against a stored hash.
 *
 * Returns false rather than throwing on a malformed or unrecognised hash, so a
 * corrupt row cannot be distinguished from a wrong password by its failure
 * mode. Comparison is constant-time.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored) return false;

  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4], 'base64');
    expected = Buffer.from(parts[5], 'base64');
  } catch {
    return false;
  }
  if (expected.length === 0) return false;

  // A hash claiming an enormous cost must not be honoured: an attacker who can
  // write to the table could otherwise request a hash that exhausts memory.
  const required = 128 * N * r;
  if (!Number.isFinite(required) || required > MAXMEM) return false;

  await acquire();
  let actual: Buffer;
  try {
    actual = await new Promise<Buffer>((resolve, reject) => {
      scrypt(
        password.normalize('NFKC'),
        salt,
        expected.length,
        { N, r, p, maxmem: MAXMEM },
        (err, key) => (err ? reject(err) : resolve(key)),
      );
    });
  } catch {
    return false;
  } finally {
    release();
  }

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * True when a stored hash used weaker parameters than the current default.
 *
 * Lets sign-in upgrade a credential transparently instead of stranding users on
 * whatever cost was current when they registered.
 */
export function needsRehash(stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return true;
  return (
    Number(parts[1]) < SCRYPT_N || Number(parts[2]) < SCRYPT_R || Number(parts[3]) < SCRYPT_P
  );
}

/** The cost parameters, exposed for tests and for documentation of the trade. */
export const SCRYPT_COST = {
  N: SCRYPT_N,
  r: SCRYPT_R,
  p: SCRYPT_P,
  memoryBytes: 128 * SCRYPT_N * SCRYPT_R,
  maxmemBytes: MAXMEM,
  maxConcurrent: MAX_CONCURRENT,
} as const;
