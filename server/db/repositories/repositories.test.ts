import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'kg-repo-'));
process.env.DATABASE_URL = `file:${path.join(dir, 'test.db')}`;
process.env.APP_URL = 'http://localhost:3000';

const { migrate } = await import('../migrate');
const { execute, closeClient } = await import('../client');
const accounts = await import('./accounts');
const sessions = await import('./sessions');
const transactions = await import('./transactions');
const evidence = await import('./evidence');
const insights = await import('./insights');
const goals = await import('./goals');
const audit = await import('./audit');
const documents = await import('./documents');
const feedback = await import('./feedback');

const PERIOD = { start: '2026-09-01', end: '2026-09-30' };

let alice: string;
let bob: string;

async function seedAccount(email: string): Promise<string> {
  const account = await accounts.createAccount(email, 'hash-not-used-in-this-suite');
  return account.id;
}

async function insertTx(
  accountId: string,
  id: string,
  overrides: Partial<{
    transaction_date: string;
    amount: number;
    direction: string;
    category_id: string | null;
    merchant_name: string;
    status: string;
    extraction_method: string;
  }> = {},
): Promise<void> {
  await execute(
    `INSERT INTO transaction_candidates
       (id, account_id, document_id, transaction_date, amount, direction, merchant_name,
        raw_text_snippet, category_id, confidence, extraction_method, status,
        is_duplicate_candidate, created_at)
     VALUES (?, ?, NULL, ?, ?, ?, ?, '', ?, NULL, ?, ?, 0, '2026-09-15')`,
    [
      id,
      accountId,
      overrides.transaction_date ?? '2026-09-15',
      overrides.amount ?? 100,
      overrides.direction ?? 'EXPENSE',
      overrides.merchant_name ?? 'Test Merchant',
      overrides.category_id === undefined ? 'cat_food' : overrides.category_id,
      overrides.extraction_method ?? 'DETERMINISTIC',
      overrides.status ?? 'ACCEPTED',
    ],
  );
}

// One hook, in order. Separate top-level hooks do not guarantee ordering here,
// and a seed that runs before migration fails with a missing table.
before(async () => {
  await migrate();

  alice = await seedAccount('alice@example.com');
  bob = await seedAccount('bob@example.com');

  await insertTx(alice, 'txn_alice_1', { amount: 500, merchant_name: 'Foodpanda' });
  await insertTx(alice, 'txn_alice_2', { amount: 250, merchant_name: 'Uber', category_id: 'cat_transport' });
  await insertTx(alice, 'txn_alice_3', { transaction_date: '2026-08-10', amount: 900 });
  await insertTx(bob, 'txn_bob_1', { amount: 7777, merchant_name: 'Bob Secret' });
});

after(() => {
  closeClient();
  try { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { /* cleanup is best-effort on Windows */ }
});

describe('account validation', () => {
  test('rejects an unusable email', async () => {
    assert.throws(() => accounts.assertValidEmail(''));
    assert.throws(() => accounts.assertValidEmail('not-an-email'));
    assert.throws(() => accounts.assertValidEmail('a@b'));
    assert.equal(accounts.assertValidEmail('  Alice@Example.COM '), 'alice@example.com');
  });

  test('rejects a password below the minimum', () => {
    assert.throws(() => accounts.assertValidPassword('short'));
    assert.doesNotThrow(() => accounts.assertValidPassword('longenoughpassword'));
  });

  test('rejects an oversized password before hashing is charged for it', () => {
    assert.throws(() => accounts.assertValidPassword('x'.repeat(300)));
  });

  test('rejects a duplicate email', async () => {
    await assert.rejects(() => accounts.createAccount('alice@example.com', 'hash'));
  });
});

describe('account scoping (constitution principle III)', () => {
  test('lists only the caller’s own transactions', async () => {
    const aliceRows = await transactions.listTransactions(alice);
    const bobRows = await transactions.listTransactions(bob);

    assert.equal(aliceRows.length, 3);
    assert.equal(bobRows.length, 1);
    assert.ok(aliceRows.every((r) => r.account_id === alice));
    assert.ok(bobRows.every((r) => r.account_id === bob));
  });

  test('never returns another account’s row, and reports it as absent', async () => {
    const stolen = await transactions.getTransaction(alice, 'txn_bob_1');
    assert.equal(stolen, null, 'a cross-account fetch must look like a missing row');

    const missing = await transactions.getTransaction(alice, 'txn_does_not_exist');
    assert.equal(missing, null);
  });

  test('counting is scoped too', async () => {
    assert.equal(await transactions.countTransactions(alice), 3);
    assert.equal(await transactions.countTransactions(bob), 1);
  });

  /**
   * Regression: a period combined with any other filter returned nothing.
   *
   * `listTransactions` built its SQL and its argument list separately. The period
   * predicate was appended to the end of the WHERE string while its two arguments
   * were pushed into `args` second, so adding a category, direction, or search term
   * shifted every later argument by two places. `GET /v1/transactions` always sends
   * a period, so every filtered ledger request in the product silently matched
   * nothing -- an empty list on a non-empty ledger.
   *
   * `repositories.test.ts` tested a period on its own and each filter on its own,
   * and never both, which is why it passed throughout.
   */
  test('a period combines with every other filter without shifting arguments', async () => {
    const period = { start: '2026-09-01', end: '2026-09-30' };
    const all = await transactions.listTransactions(alice, { period, limit: 100 });
    assert.ok(all.length > 0, 'the fixture must hold rows in September');

    const first = all[0];

    const byCategory = await transactions.listTransactions(alice, {
      period, categoryId: first.category_id ?? undefined, limit: 100,
    });
    assert.ok(
      byCategory.some((r) => r.id === first.id),
      'period + category returned nothing',
    );

    const byDirection = await transactions.listTransactions(alice, {
      period, direction: first.direction, limit: 100,
    });
    assert.ok(byDirection.some((r) => r.id === first.id), 'period + direction returned nothing');

    const bySearch = await transactions.listTransactions(alice, {
      period, search: first.merchant_name.slice(0, 6), limit: 100,
    });
    assert.ok(bySearch.some((r) => r.id === first.id), 'period + search returned nothing');

    // And the page size is still bound to LIMIT, not to a filter column.
    assert.ok(
      (await transactions.listTransactions(alice, { period, limit: 1 })).length === 1,
      'LIMIT is not being applied',
    );

    // A non-matching filter still returns nothing, so the fix did not make every
    // query permissive.
    const miss = await transactions.listTransactions(alice, {
      period, categoryId: 'cat_does_not_exist', limit: 100,
    });
    assert.equal(miss.length, 0, 'a filter that matches nothing must return nothing');

    const outside = await transactions.listTransactions(alice, {
      period: { start: '2026-07-01', end: '2026-07-31' }, limit: 100,
    });
    assert.equal(outside.length, 0, 'a period outside the rows must return nothing');
  });

  test('a LIKE wildcard in a search term is escaped, not honoured', async () => {
    // Searching `%` must not match every row, and `_` must not match any character.
    const pct = await transactions.listTransactions(alice, { search: '%', limit: 100 });
    assert.equal(pct.length, 0, 'a bare % matched rows');

    const underscore = await transactions.listTransactions(alice, { search: '_', limit: 100 });
    assert.equal(underscore.length, 0, 'a bare _ matched rows');
  });

  test('the count and the list agree about what a filter matches', async () => {
    // They were assembled separately, so a mixed-case search could count rows the
    // list then refused to return.
    const period = { start: '2026-09-01', end: '2026-09-30' };
    for (const opts of [
      { period },
      { period, direction: 'EXPENSE' },
      { period, search: 'a' },
    ]) {
      assert.equal(
        await transactions.countTransactions(alice, opts),
        (await transactions.listTransactions(alice, { ...opts, limit: 1000 })).length,
        `count and list disagree for ${JSON.stringify(opts)}`,
      );
    }
  });

  test('period filters apply within the caller’s own rows only', async () => {
    const september = await transactions.listTransactions(alice, { period: PERIOD });
    assert.equal(september.length, 2);

    const august = await transactions.listTransactions(alice, {
      period: { start: '2026-08-01', end: '2026-08-31' },
    });
    assert.equal(august.length, 1);
    assert.equal(august[0].id, 'txn_alice_3');
  });

  test('a category filter cannot reach across accounts', async () => {
    const bobViaCategory = await transactions.listTransactions(bob, { categoryId: 'cat_food' });
    assert.equal(bobViaCategory.length, 1);
    assert.ok(bobViaCategory.every((r) => r.account_id === bob));
  });

  test('search is scoped to the caller', async () => {
    const found = await transactions.listTransactions(alice, { search: 'secret' });
    assert.equal(found.length, 0, 'alice must not be able to search bob’s rows');
  });
});

describe('period validation', () => {
  test('rejects a reversed range rather than returning nothing', () => {
    assert.throws(() => transactions.assertPeriod({ start: '2026-09-30', end: '2026-09-01' }));
  });

  test('rejects a malformed date', () => {
    assert.throws(() => transactions.assertPeriod({ start: 'Sep 2026', end: '2026-09-30' }));
  });

  test('rejects an unbounded range', () => {
    assert.throws(() => transactions.assertPeriod({ start: '1900-01-01', end: '2026-09-30' }));
  });

  test('accepts a sane range', () => {
    assert.doesNotThrow(() => transactions.assertPeriod(PERIOD));
  });
});

describe('goals', () => {
  test('creates without inventing a date or an amount', async () => {
    const goal = await goals.createGoal({
      accountId: alice,
      title: 'Emergency buffer',
      targetAmount: 150000,
      targetDate: '2027-03-31',
    });
    assert.equal(goal.target_date, '2027-03-31');
    assert.equal(goal.target_amount, 150000);
  });

  test('refuses a zero target instead of storing a division by zero', async () => {
    await assert.rejects(() =>
      goals.createGoal({ accountId: alice, title: 'Zero', targetAmount: 0, targetDate: '2027-01-01' }),
    );
  });

  test('refuses an empty title and a malformed date', async () => {
    await assert.rejects(() =>
      goals.createGoal({ accountId: alice, title: '   ', targetAmount: 100, targetDate: '2027-01-01' }),
    );
    await assert.rejects(() =>
      goals.createGoal({ accountId: alice, title: 'x', targetAmount: 100, targetDate: 'soon' }),
    );
  });

  test('deleting another account’s goal reports nothing changed', async () => {
    const goal = await goals.createGoal({
      accountId: alice,
      title: 'Alice goal',
      targetAmount: 1000,
      targetDate: '2027-01-01',
    });

    assert.equal(await goals.deleteGoal(bob, goal.id), false, 'bob must not delete alice’s goal');
    assert.equal(await goals.getGoal(alice, goal.id) !== null, true, 'goal must survive');
    assert.equal(await goals.deleteGoal(alice, goal.id), true);
  });
});

describe('insights', () => {
  test('drops a finding that cites nothing rather than storing it', async () => {
    const stored = await insights.replaceInsights(alice, [
      {
        type: 'SMALL_PURCHASES',
        title: 'Real finding',
        description: 'd',
        confidence: 0.9,
        calculationVersion: 'engine-1.1.0',
        supportingTransactionIds: ['txn_alice_1'],
        periodStart: PERIOD.start,
        periodEnd: PERIOD.end,
        recommendations: [],
      },
      {
        type: 'SMALL_PURCHASES',
        title: 'Unsupported finding',
        description: 'd',
        confidence: 0.9,
        calculationVersion: 'engine-1.1.0',
        supportingTransactionIds: [],
        periodStart: PERIOD.start,
        periodEnd: PERIOD.end,
        recommendations: [],
      },
    ]);

    assert.equal(stored.insightIds.length, 1);
    const listed = await insights.listInsights(alice);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].title, 'Real finding');
    assert.deepEqual(listed[0].supportingTransactionIds, ['txn_alice_1']);
  });

  test('is scoped to the account', async () => {
    assert.deepEqual(await insights.listInsights(bob), []);
    const aliceInsight = (await insights.listInsights(alice))[0];
    assert.equal(await insights.getInsight(bob, aliceInsight.id), null);
  });

  // The defect this pins: `replaceInsights` existed and was never called, and
  // `GET /v1/insights` listed an in-memory map. A user's clues therefore vanished
  // on restart while the ledger they were computed from was still stored. The
  // test reads only through the repository, so it fails if the write path is
  // bypassed, not merely if the read path regresses.
  test('insights survive losing the memory map', async () => {
    await insights.replaceInsights(alice, [
      {
        type: 'SMALL_PURCHASES',
        title: 'Durable finding',
        description: 'd',
        confidence: 0.95,
        calculationVersion: 'v1.0-deterministic',
        supportingTransactionIds: ['txn_alice_1'],
        periodStart: PERIOD.start,
        periodEnd: PERIOD.end,
        recommendations: [
          {
            action_type: 'REDUCE_FREQUENCY',
            title: 'Fewer small buys',
            description: 'd',
            potential_savings_min: 100,
            potential_savings_max: 400,
            calculation_method: 'engine',
            calculationVersion: 'v1.0-deterministic',
            supportingTransactionIds: ['txn_alice_1'],
          },
        ],
      },
    ]);

    // Nothing here clears memory, because the relational store is the only place
    // the insight was ever written. Reading it back is the whole assertion.
    const stored = await insights.listInsights(alice);
    assert.equal(stored.length, 1);
    assert.equal(stored[0].title, 'Durable finding');
  });

  test('the saving figure reaches the card even though it is not a column on insights', async () => {
    const rows = await insights.listInsights(alice);
    const byInsight = await insights.recommendationsByInsight(alice);
    const withRecs = rows.map((row) => insights.toClientInsight(row, byInsight.get(row.id) ?? []));

    const card = withRecs.find((i) => i.title === 'Durable finding');
    assert.ok(card, 'the finding with a recommendation must be present');
    assert.equal(card.potential_savings_bdt, 400);
    assert.equal(card.summary, 'd', 'the prose the views read must survive the rename');
    assert.deepEqual(card.supporting_transaction_ids, ['txn_alice_1']);
  });

  test('a recommendation is never returned without the insight it cites', async () => {
    const recs = await insights.listRecommendations(alice);
    assert.ok(recs.length > 0, 'the recommendation written above must be readable');
    for (const rec of recs) {
      const parent = await insights.getInsight(alice, rec.insight_id);
      assert.ok(parent, `recommendation ${rec.id} points at a missing insight`);
      assert.equal(parent.account_id, alice, 'a recommendation must never cross accounts');
    }
  });

  test('recomputation replaces recommendations as well as insights', async () => {
    const before = await insights.listRecommendations(alice);
    assert.ok(before.length > 0);

    await insights.replaceInsights(alice, [
      {
        type: 'PERIOD_COMPARISON',
        title: 'No recommendations this time',
        description: 'd',
        confidence: 0.8,
        calculationVersion: 'v1.0-deterministic',
        supportingTransactionIds: ['txn_alice_1'],
        periodStart: PERIOD.start,
        periodEnd: PERIOD.end,
        recommendations: [],
      },
    ]);

    const after = await insights.listRecommendations(alice);
    assert.deepEqual(after, [], 'stale recommendations must not outlive their insight');
  });

  // Feedback was written to an in-memory array and read back for `tracked`, so a
  // saving marked acted-on showed as untracked after a restart. It moved to the
  // relational store because the lookups for it and for the recommendation itself
  // both read the maps, which no longer hold insights or recommendations at all.
  test('an acted_on mark survives and is returned in one query', async () => {
    // Seeded here rather than borrowed from an earlier test: a later test replaces
    // recommendations with none, so depending on their presence would be an
    // order-dependent test that passes for the wrong reason.
    await insights.replaceInsights(alice, [
      {
        type: 'SMALL_PURCHASES',
        title: 'Feedback target',
        description: 'd',
        confidence: 0.9,
        calculationVersion: 'v1.0-deterministic',
        supportingTransactionIds: ['txn_alice_1'],
        periodStart: PERIOD.start,
        periodEnd: PERIOD.end,
        recommendations: [
          {
            action_type: 'REDUCE_FREQUENCY',
            title: 'A saving to track',
            description: 'd',
            potential_savings_min: 100,
            potential_savings_max: 200,
            calculation_method: 'engine',
            calculationVersion: 'v1.0-deterministic',
            supportingTransactionIds: ['txn_alice_1'],
          },
        ],
      },
    ]);

    const stored = await insights.listRecommendations(alice);
    assert.ok(stored.length > 0, 'a recommendation must exist to mark');

    await feedback.recordFeedback({
      accountId: alice,
      objectType: 'Recommendation',
      objectId: stored[0].id,
      feedbackType: 'acted_on',
    });

    const tracked = await feedback.actedOnIds(alice, 'Recommendation', stored.map((r) => r.id));
    assert.equal(tracked.has(stored[0].id), true);
  });

  test('another account cannot see the mark', async () => {
    const stored = await insights.listRecommendations(alice);
    const tracked = await feedback.actedOnIds(bob, 'Recommendation', stored.map((r) => r.id));
    assert.equal(tracked.size, 0, 'feedback is scoped to the account that gave it');
  });

  // The defect this pins: insight and recommendation ids were generated randomly on
  // every recompute. Marking a saving acted-on stored the mark against `rec_A`; the
  // next recompute — which the manual-entry, edit, confirm, and delete routes all
  // trigger — replaced it with `rec_B`, and the mark silently vanished. Content-seeded
  // ids keep the record addressable across a recompute that produces the same finding.
  test('an acted_on mark survives a recompute that produces the same finding', async () => {
    const finding = {
      type: 'MERCHANT_FREQUENCY',
      title: 'Feedback survives recompute',
      description: 'd',
      confidence: 0.9,
      calculationVersion: 'v1.0-deterministic',
      supportingTransactionIds: ['txn_alice_1'],
      periodStart: PERIOD.start,
      periodEnd: PERIOD.end,
      recommendations: [
        {
          action_type: 'REDUCE_FREQUENCY',
          title: 'Stable saving',
          description: 'd',
          potential_savings_min: 100,
          potential_savings_max: 250,
          calculation_method: 'engine',
          calculationVersion: 'v1.0-deterministic',
          supportingTransactionIds: ['txn_alice_1'],
        },
      ],
    };

    const first = await insights.replaceInsights(alice, [finding]);
    const recBefore = await insights.listRecommendations(alice);
    assert.equal(recBefore.length, 1);
    assert.equal(recBefore[0].id, first.recommendationIds[0]);

    await feedback.recordFeedback({
      accountId: alice,
      objectType: 'Recommendation',
      objectId: recBefore[0].id,
      feedbackType: 'acted_on',
    });

    const second = await insights.replaceInsights(alice, [finding]);
    const recAfter = await insights.listRecommendations(alice);
    assert.equal(recAfter.length, 1);
    assert.equal(
      second.recommendationIds[0],
      first.recommendationIds[0],
      'ids must be stable while the finding is unchanged',
    );
    assert.equal(recAfter[0].id, recBefore[0].id);

    const tracked = await feedback.actedOnIds(alice, 'Recommendation', recAfter.map((r) => r.id));
    assert.equal(tracked.has(recAfter[0].id), true, 'the mark must outlive the recompute');
  });

  test('a recommendation can be fetched on its own, which the feedback route needs', async () => {
    const stored = await insights.listRecommendations(alice);
    assert.ok(stored.length > 0, 'the seeded recommendation must still be present');
    const one = await insights.getRecommendation(alice, stored[0].id);
    assert.ok(one, 'the in-memory map would have returned nothing here');
    assert.equal(await insights.getRecommendation(bob, stored[0].id), null);
  });

  test('rejects a type the engine never emits', async () => {
    // The CHECK is the last line of defence. Engine output is trusted code, but a
    // future detector emitting a name the table does not allow should fail loudly
    // here rather than silently dropping clues in production.
    await assert.rejects(
      () =>
        insights.replaceInsights(alice, [
          {
            type: 'MICRO_SPEND',
            title: 'Stale vocabulary',
            description: 'd',
            confidence: 0.5,
            calculationVersion: 'v1.0-deterministic',
            supportingTransactionIds: ['txn_alice_1'],
            periodStart: PERIOD.start,
            periodEnd: PERIOD.end,
            recommendations: [],
          },
        ]),
      /CHECK constraint failed/,
    );
  });

  test('replaces rather than accumulating, so stale findings do not linger', async () => {
    await insights.replaceInsights(alice, [
      {
        type: 'SMALL_PURCHASES',
        title: 'Second run',
        description: 'd',
        confidence: 0.9,
        calculationVersion: 'engine-1.1.0',
        supportingTransactionIds: ['txn_alice_1'],
        periodStart: PERIOD.start,
        periodEnd: PERIOD.end,
        recommendations: [],
      },
    ]);
    const listed = await insights.listInsights(alice);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].title, 'Second run');
  });
});

describe('evidence', () => {
  test('reports no evidence rather than failing when a row has none', async () => {
    assert.deepEqual(await evidence.evidenceForTransaction(alice, 'txn_alice_1'), []);
  });

  test('cannot read evidence through another account’s transaction', async () => {
    const doc = await documents.insertDocument({
      accountId: bob,
      sourceKind: 'MOBILE_WALLET',
      provider: 'bKash',
      originalFilename: 'bob.pdf',
      detectedMime: 'application/pdf',
      byteSize: 10,
      contentFingerprint: 'fp-bob',
      stage: 'COMPLETED',
    });

    await execute(
      `INSERT INTO evidence (id, account_id, document_id, evidence_type, raw_text, created_at)
       VALUES ('ev_bob_1', ?, ?, 'AMOUNT', 'secret line', '2026-09-01')`,
      [bob, doc.id],
    );
    await execute(`INSERT INTO transaction_evidence (transaction_id, evidence_id) VALUES ('txn_bob_1','ev_bob_1')`);

    const asBob = await evidence.evidenceForTransaction(bob, 'txn_bob_1');
    assert.equal(asBob.length, 1);

    const asAlice = await evidence.evidenceForTransaction(alice, 'txn_bob_1');
    assert.deepEqual(asAlice, [], 'alice must not read bob’s evidence');
  });

  test('hasEvidence is scoped too', async () => {
    assert.equal(await evidence.hasEvidence(bob, 'txn_bob_1'), true);
    assert.equal(await evidence.hasEvidence(alice, 'txn_bob_1'), false);
  });
});

describe('documents', () => {
  test('lists only the caller’s own documents', async () => {
    const list = await documents.listDocuments(bob);
    assert.ok(list.every((d) => d.account_id === bob));
  });

  test('row count stays null until extraction succeeds', async () => {
    const doc = await documents.insertDocument({
      accountId: alice,
      sourceKind: 'DELIMITED',
      provider: null,
      originalFilename: 'statement.csv',
      detectedMime: 'text/csv',
      byteSize: 100,
      contentFingerprint: 'fp-alice',
      stage: 'QUEUED',
    });
    assert.equal(doc.row_count, null, 'a queued document has no row count');

    await documents.completeDocument(alice, doc.id, { stage: 'COMPLETED', rowCount: 18 });
    const updated = await documents.getDocument(alice, doc.id);
    assert.equal(updated?.row_count, 18);
  });

  test('completion cannot touch another account’s document', async () => {
    const doc = await documents.insertDocument({
      accountId: alice,
      sourceKind: 'DELIMITED',
      provider: null,
      originalFilename: 'x.csv',
      detectedMime: 'text/csv',
      byteSize: 1,
      contentFingerprint: 'fp-x',
      stage: 'QUEUED',
    });
    await documents.completeDocument(bob, doc.id, { stage: 'FAILED' });
    const unchanged = await documents.getDocument(alice, doc.id);
    assert.equal(unchanged?.stage, 'QUEUED');
  });
});

describe('audit trail', () => {
  test('records an action and lists it back', async () => {
    await audit.recordAudit({
      accountId: alice,
      action: 'OWNERSHIP_REFUSED',
      resourceType: 'Transaction',
      resourceId: 'txn_bob_1',
    });
    const refusals = await audit.listOwnershipRefusals(alice);
    assert.equal(refusals.length, 1);
    assert.equal(refusals[0].resource_id, 'txn_bob_1');
  });

  test('does not leak one account’s audit to another', async () => {
    assert.deepEqual(await audit.listAudit(bob), []);
  });

  test('stores no financial content', async () => {
    const rows = await audit.listAudit(alice);
    for (const row of rows) {
      assert.equal(Object.prototype.hasOwnProperty.call(row, 'amount'), false);
      assert.equal(Object.prototype.hasOwnProperty.call(row, 'merchant_name'), false);
      assert.equal(Object.prototype.hasOwnProperty.call(row, 'raw_text'), false);
    }
  });
});

describe('sessions', () => {
  const hash = (input: string) => `sha256:${input}`;
  // A real token generator rather than a fixed string: sessions.token_hash is
  // UNIQUE, so a repeated token is rejected as the collision it would be.
  let counter = 0;
  const token = () => `raw-token-${++counter}`;

  test('stores only a hash, never the raw token', async () => {
    const issued = await sessions.issueSession(alice, hash, token);
    assert.match(issued.token, /^raw-token-/);
    const row = await querySessionsFor(alice);
    assert.equal(row.token_hash, hash(issued.token));
    assert.notEqual(row.token_hash, issued.token, 'the raw token must never be stored');
  });

  test('refuses a duplicate token hash', async () => {
    const fixed = 'collision-probe';
    await sessions.issueSession(alice, hash, () => fixed);
    await assert.rejects(
      () => sessions.issueSession(alice, hash, () => fixed),
      'a repeated token must be rejected',
    );
  });

  test('resolves a live session and rejects a revoked one', async () => {
    const issued = await sessions.issueSession(alice, hash, token);
    const live = await sessions.resolveSession(hash(issued.token), hash);
    assert.ok(live);
    assert.equal(live?.account_id, alice);

    await sessions.revokeSession(issued.sessionId);
    const afterRevoke = await sessions.resolveSession(hash(issued.token), hash);
    assert.equal(afterRevoke, null, 'revocation must take effect immediately');
  });

  test('revoking every session locks the account out', async () => {
    const issued = await sessions.issueSession(alice, hash, token);
    await sessions.revokeAllForAccount(alice);
    assert.equal(await sessions.resolveSession(hash(issued.token), hash), null);
  });

  test('an expired session resolves to nothing rather than an error', async () => {
    const issued = await sessions.issueSession(alice, hash, token);
    await execute(`UPDATE sessions SET absolute_expires_at = ? WHERE id = ?`, [
      new Date(Date.now() - 1000).toISOString(),
      issued.sessionId,
    ]);
    assert.equal(await sessions.resolveSession(hash(issued.token), hash), null);
  });

  test('an idle session expires', async () => {
    const issued = await sessions.issueSession(alice, hash, token);
    await execute(`UPDATE sessions SET last_seen_at = ? WHERE id = ?`, [
      new Date(Date.now() - sessions.IDLE_TIMEOUT_MS - 1000).toISOString(),
      issued.sessionId,
    ]);
    assert.equal(await sessions.resolveSession(hash(issued.token), hash), null);
  });
});

async function querySessionsFor(accountId: string) {
  const { query } = await import('../client');
  const rows = await query<{ token_hash: string }>(
    `SELECT token_hash FROM sessions WHERE account_id = ? ORDER BY created_at DESC LIMIT 1`,
    [accountId],
  );
  return rows[0];
}
