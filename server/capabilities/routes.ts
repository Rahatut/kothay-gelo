import { Router, type Request, type Response } from 'express';
import { invokeCapability, describeCapabilityError } from './guard';
import { registerAll, CAPABILITY_NAMES, registeredNames, type Capability } from './registry';
import {
  financialSummary,
  categoryBreakdown,
  transactions as transactionsCapability,
  topMerchants,
  recurringExpenses,
  comparePeriods,
  spendingPatterns,
  savingsEstimation,
} from './handlers';

/**
 * The capability endpoint.
 *
 * `POST /v1/capabilities/:name` is the only path to a financial figure that
 * does not go through the engine. Analytical routes may exist for transport
 * convenience, but each of them delegates here rather than computing.
 */

// Registration happens once, at module load. Registering a name twice throws, so
// a duplicated import surfaces immediately instead of silently shadowing a
// handler.
registerAll([
  financialSummary,
  categoryBreakdown,
  transactionsCapability,
  topMerchants,
  recurringExpenses,
  comparePeriods,
  spendingPatterns,
  savingsEstimation,
] as unknown as Capability<never>[]);

export const capabilityRouter = Router();

capabilityRouter.post('/:name', async (req: Request, res: Response) => {
  try {
    // The session guard has already established req.accountId by the time this
    // runs. It is read here and never from the body, which is what stops a
    // caller from asking a question about somebody else's ledger.
    const envelope = await invokeCapability({
      name: req.params.name,
      params: (req.body as { params?: unknown } | undefined)?.params,
      accountId: req.accountId ?? null,
      sessionId: req.sessionId ?? null,
      today: new Date().toISOString().slice(0, 10),
      locale: 'en',
    });

    return res.json(envelope);
  } catch (err) {
    const { status, body } = describeCapabilityError(err);
    return res.status(status).json(body);
  }
});

/**
 * Lists the approved capabilities.
 *
 * Useful rather than decorative: it makes the fixed tool surface of Principle II
 * discoverable, so a caller never has to guess whether a question is answerable.
 */
capabilityRouter.get('/', (_req: Request, res: Response) => {
  return res.json({
    ok: true,
    capabilities: CAPABILITY_NAMES,
    implemented: registeredNames(),
  });
});