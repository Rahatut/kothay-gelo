import {
  CapabilityError,
  isCapabilityName,
  lookup,
  type CapabilityContext,
  type CapabilityResult,
} from './registry';

/**
 * The single path to a financial figure.
 *
 * Three guarantees live here rather than in each handler, because getting any of
 * them wrong is a data breach rather than a bug:
 *
 *   1. Identity arrives from the resolved session. A caller-supplied account id
 *      is never read — the previous `getAuthenticatedUserId` ignored the request
 *      and returned a constant, which made every ownership check unfailable.
 *   2. Every capability declares the period it is being asked about. There is
 *      no default, so a handler cannot quietly answer about the wrong month.
 *   3. A not-found and a not-owned resource are reported identically, so
 *      ownership cannot be probed by comparing responses.
 */

export interface CapabilityEnvelope {
  ok: true;
  capability: string;
  params: unknown;
  calculation_version: string;
  status?: 'insufficient_data';
  data?: unknown;
  evidence?: { transaction_ids: string[] };
  estimate?: { basis: string };
}

export interface InvokeOptions {
  name: string;
  params: unknown;
  accountId: string | null;
  sessionId: string | null;
  today: string;
  locale: 'en' | 'bn';
}

/**
 * Validates and runs a capability.
 *
 * Throws `CapabilityError` for client mistakes; the route maps those to
 * statuses. Data insufficiency is not an error — it is a successful answer that
 * says the data cannot respond.
 */
export async function invokeCapability(options: InvokeOptions): Promise<CapabilityEnvelope> {
  const capability = lookup(options.name);

  // An unknown capability and a known-but-unimplemented one are reported the
  // same way, so the set of addressable capabilities does not leak by absence.
  if (!capability) {
    throw new CapabilityError(
      'unsupported_capability',
      `"${options.name}" is not one of the approved financial capabilities.`,
    );
  }

  if (!options.accountId) {
    // Thrown as a programming error rather than a 401: the route installs the
    // session guard, so reaching here unauthenticated means the guard was
    // bypassed and the response must not describe a data question at all.
    throw new CapabilityError('invalid_params', 'No authenticated account for this request.');
  }

  // Validation runs before any query, and throws rather than coercing. A coerced
  // filter answers a question the user did not ask.
  const params = capability.validate(options.params);

  const context: CapabilityContext = {
    accountId: options.accountId,
    sessionId: options.sessionId,
    today: options.today,
    locale: options.locale,
  };

  const result: CapabilityResult = await capability.handler(context, params);

  if ('status' in result) {
    return {
      ok: true,
      capability: capability.name,
      params,
      calculation_version: 'engine-1.1.0',
      status: 'insufficient_data',
      data: undefined,
      // Insufficiency is returned with no figures at all, so there is nothing
      // for a caller to mistake for a real number.
      evidence: { transaction_ids: [] },
    };
  }

  return {
    ok: true,
    capability: capability.name,
    params,
    calculation_version: 'engine-1.1.0',
    data: result.data,
    evidence: result.evidence,
    estimate: result.estimate,
  };
}

/** True when the value names an approved capability, for routing and tests. */
export { isCapabilityName };

/**
 * Maps a capability failure to a status and body.
 *
 * `not_found` deliberately covers both "no such record" and "not yours".
 */
export function describeCapabilityError(err: unknown): { status: number; body: object } {
  if (err instanceof CapabilityError) {
    switch (err.code) {
      case 'unsupported_capability':
        return {
          status: 404,
          body: { ok: false, error: 'unsupported_capability', message: err.message },
        };
      case 'not_found':
        return {
          status: 404,
          body: {
            ok: false,
            error: 'not_found',
            message: 'That resource does not exist.',
          },
        };
      case 'invalid_params':
      default:
        return {
          status: 422,
          body: { ok: false, error: 'invalid_params', message: err.message },
        };
    }
  }

  // A RangeError from period validation is a client mistake, not a fault.
  if (err instanceof RangeError) {
    return {
      status: 422,
      body: { ok: false, error: 'invalid_params', message: err.message },
    };
  }

  console.error('[capability] unexpected failure:', err);
  return {
    status: 500,
    body: { ok: false, error: 'error', message: 'Could not answer that right now.' },
  };
}