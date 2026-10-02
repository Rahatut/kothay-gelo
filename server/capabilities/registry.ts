/**
 * The approved financial capabilities.
 *
 * Constitution Principle II ratified eight capabilities in version 1.0.0. They
 * were never implemented. This registry is that list, made addressable.
 *
 * A ninth capability may not be added without amending the constitution. No
 * analytical route may compute a figure outside this registry — that is the
 * whole point, because a route that computes for itself is a route nobody
 * reviewed.
 */

export const CAPABILITY_NAMES = [
  'financial_summary',
  'category_breakdown',
  'transactions',
  'top_merchants',
  'recurring_expenses',
  'compare_periods',
  'spending_patterns',
  'savings_estimation',
] as const;

export type CapabilityName = (typeof CAPABILITY_NAMES)[number];

export function isCapabilityName(value: string): value is CapabilityName {
  return (CAPABILITY_NAMES as readonly string[]).includes(value);
}

/** Identity as the capability layer sees it: resolved by the server, never supplied. */
export interface CapabilityContext {
  accountId: string;
  sessionId: string | null;
  /** ISO date used to decide whether a period is still accruing. */
  today: string;
  locale: 'en' | 'bn';
}

/**
 * Every answer carries the engine version that produced its figures, so a
 * stored number stays interpretable after the method changes underneath it.
 */
export const CALCULATION_VERSION = 'engine-1.1.0';

export type CapabilityHandler<TParams = unknown> = (
  ctx: CapabilityContext,
  params: TParams,
) => Promise<CapabilityResult>;

/** First-class insufficiency: a 200 whose body says the data cannot answer. */
export interface InsufficientData {
  status: 'insufficient_data';
  reason: string;
  message: string;
  missing?: Record<string, unknown>;
}

export interface CapabilitySuccess {
  data: unknown;
  /** Rows behind the figures. Required whenever the capability produces a number. */
  evidence?: { transaction_ids: string[] };
  /** Set when the answer describes a period that has not finished. */
  estimate?: { basis: string };
}

export type CapabilityResult = CapabilitySuccess | InsufficientData;

export function insufficient(
  reason: string,
  message: string,
  missing?: Record<string, unknown>,
): InsufficientData {
  return { status: 'insufficient_data', reason, message, ...(missing ? { missing } : {}) };
}

export function isInsufficient(result: CapabilityResult): result is InsufficientData {
  return 'status' in result && result.status === 'insufficient_data';
}

/** Uniform failure signalling so the guard can map it to a status code. */
export class CapabilityError extends Error {
  constructor(
    readonly code: 'invalid_params' | 'not_found' | 'unsupported_capability',
    message: string,
  ) {
    super(message);
    this.name = 'CapabilityError';
  }
}

export interface Capability<TParams = unknown> {
  name: CapabilityName;
  /** Validates and narrows raw input. Throws `CapabilityError`. Never coerces. */
  validate: (raw: unknown) => TParams;
  handler: CapabilityHandler<TParams>;
}

const registry = new Map<CapabilityName, Capability<never>>();

export function register<TParams>(capability: Capability<TParams>): void {
  if (registry.has(capability.name)) {
    throw new Error(`capability "${capability.name}" is already registered`);
  }
  registry.set(capability.name, capability as unknown as Capability<never>);
}

export function lookup(name: string): Capability<never> | undefined {
  return isCapabilityName(name) ? registry.get(name) : undefined;
}

/** Registers every capability. Called once at module load of the handlers index. */
export function registerAll(handlers: Capability<never>[]): void {
  for (const handler of handlers) register(handler);
}

export function registeredNames(): CapabilityName[] {
  return CAPABILITY_NAMES.filter((name) => registry.has(name));
}