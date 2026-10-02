/**
 * Validated access to process environment.
 *
 * Secrets enter here from the environment and nowhere else. Nothing in this
 * module is logged, echoed into a response, or serialised. `.env` is a local
 * development convenience only; AI Studio injects these at runtime from the
 * Secrets panel, so an absent value here is a deployment error rather than a
 * condition to tolerate silently.
 */

/** Raised when required configuration is missing or malformed. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

function read(name: string): string | undefined {
  const raw = process.env[name];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function requireValue(name: string): string {
  const value = read(name);
  if (value === undefined) {
    throw new ConfigError(
      `${name} is not set. Copy .env.example to .env for local development, ` +
        `or configure ${name} in the AI Studio Secrets panel.`,
    );
  }
  return value;
}

/**
 * Database target. A `file:` URL is development only — the container
 * filesystem is ephemeral, so a local file loses every record on instance
 * restart and fails the persistence requirement. Production must be `libsql://`.
 */
export function databaseUrl(): string {
  const url = requireValue('DATABASE_URL');
  const isRemote = url.startsWith('libsql://') || url.startsWith('https://');
  const isLocal = url.startsWith('file:');
  if (!isRemote && !isLocal) {
    throw new ConfigError(
      `DATABASE_URL must begin with "libsql://" or "file:", received "${url.slice(0, 12)}…".`,
    );
  }
  return url;
}

/** True when the database target is a local file, which must never ship. */
export function isLocalDatabase(): boolean {
  return databaseUrl().startsWith('file:');
}

/**
 * Auth token for the remote database. Required in production, where a libSQL
 * URL without a token would be unauthenticated.
 */
export function databaseAuthToken(): string | undefined {
  return read('DATABASE_AUTH_TOKEN');
}

/**
 * Public origin of this deployment. Used for Origin checking on state-changing
 * requests, so a cross-origin page cannot drive an authenticated session.
 */
export function appUrl(): string {
  const url = requireValue('APP_URL');
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ConfigError(`APP_URL must be an absolute URL, received "${url}".`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ConfigError(`APP_URL must be http or https, received "${parsed.protocol}".`);
  }
  // Trailing slash would make an exact Origin comparison fail for every request.
  return parsed.origin;
}

/**
 * Model API key. Optional: the application degrades to the deterministic
 * parser and deterministic narration when it is absent, which is a supported
 * mode rather than a failure.
 */
export function geminiApiKey(): string | undefined {
  return read('GEMINI_API_KEY');
}

/** Whether demo rows should be seeded at boot. Off by default. */
export function demoSeedEnabled(): boolean {
  return read('DEMO_SEED') === '1';
}

/** Port for the HTTP server. Defaults to 3000, matching the platform contract. */
export function port(): number {
  const raw = read('PORT');
  if (raw === undefined) return 3000;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new ConfigError(`PORT must be an integer between 1 and 65535, received "${raw}".`);
  }
  return parsed;
}

/**
 * Fails fast when required configuration is absent. Called once at boot so a
 * misconfigured deployment reports one clear error instead of surfacing a
 * confusing failure on the first request that happens to need the value.
 */
export function assertRequiredConfig(): void {
  databaseUrl();
  appUrl();
}
