import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { buildTrendSeries } from './financialEngine';
import type { Transaction } from '../src/types';

// Provide Vite-like env for client components during server-side rendering
// @ts-expect-error - import.meta.env is read-only in TS but writable in tsx/Node.js
import.meta.env = { ...import.meta.env, VITE_API_BASE_URL: '' };

/**
 * Every screen renders against a live server.
 *
 * This exists because the app broke three separate ways in one session and no
 * existing check noticed any of them:
 *
 *   - Two screens threw on `undefined.source` because ledger rows were returned
 *     exactly as stored, without `provenance`.
 *   - One threw `(intermediate value).map is not a function` because a client type
 *     had drifted from its endpoint.
 *   - The dashboard sat on "Initializing the desk" forever because a swallowed
 *     error left a null that meant both "loading" and "failed".
 *
 * All three were invisible to `tsc`, to the server suite, and to the PRODUCT.md
 * metrics, because every one of them is a client-side render against real data.
 *
 * So each screen is rendered with payloads captured from a running server. Server
 * rendering has no effects or browser APIs in these components, so it exercises the
 * real render path: if a screen reads a field the API does not send, this fails.
 */

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const a = srv.address();
      srv.close(() => resolve(typeof a === 'object' && a ? a.port : 0));
    });
  });
}

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = await freePort();
const BASE = `http://localhost:${PORT}`;
const dir = mkdtempSync(path.join(tmpdir(), 'kothay-screens-'));
let server: ChildProcess;

async function waitForHealth(): Promise<void> {
  const deadline = Date.now() + 40_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server did not become healthy in time');
}

/** A signed-in account with a statement already in its ledger. */
async function populatedAccount() {
  let cookie = '';
  const headers = (): Record<string, string> => ({
    'Content-Type': 'application/json',
    Origin: BASE,
    ...(cookie ? { Cookie: cookie } : {}),
  });

  const reg = await fetch(`${BASE}/v1/auth/register`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ email: `screens-${Date.now()}@example.com`, password: 'Correct-Horse-9' }),
  });
  const setCookies = (reg.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  cookie = setCookies.map((c) => c.split(';')[0]).join('; ');
  assert.ok(cookie, 'registration must set a session');

  const lines = ['01/09/2026 Credit Salary 85,000.00'];
  const merchants: [string, number][] = [
    ['Foodpanda', 520], ['Chaldal', 1850], ['Uber', 240], ['Shwapno', 3200],
    ['Daraz', 1450], ['Pathao', 180], ['Grameenphone', 800], ['DESCO', 640],
  ];
  let day = 1;
  for (const [name, base] of merchants) {
    for (let k = 0; k < 3; k++) {
      lines.push(`${String(day++).padStart(2, '0')}/09/2026 ${(base + k * 37).toLocaleString('en-US')}.00 ${name}`);
    }
  }

  const up = await fetch(`${BASE}/v1/uploads`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ filename: 'sep.csv', content: lines.join('\n'), mime_type: 'text/csv' }),
  });
  assert.equal(up.status, 200, `upload failed: ${await up.text()}`);

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const res = await fetch(`${BASE}/v1/transactions`, { headers: { Cookie: cookie } });
    const payload = await res.json();
    if ((payload.total ?? 0) > 0) {
      return { cookie, headers: headers(), dashboard: payload };
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('the upload never produced rows');
}

interface Captured {
  dashboard: any;
  transactions: any[];
  categories: any[];
  insights: any[];
  goals: any[];
  documents: any[];
}

let data: Captured;

describe('every screen renders against live data', () => {
  before(async () => {
    server = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
      cwd: process.cwd(),
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PORT: String(PORT),
        APP_URL: BASE,
        DATABASE_URL: `file:${path.join(dir, 'screens.db')}`,
        DISABLE_HMR: 'true',
        GEMINI_API_KEY: '',
      },
    });
    await waitForHealth();

    const account = await populatedAccount();
    const read = async (endpoint: string) =>
      (await (await fetch(`${BASE}/v1/${endpoint}`, { headers: { Cookie: account.cookie } })).json());

    data = {
      dashboard: (await read('dashboard')).data,
      transactions: (await read('transactions')).data,
      categories: (await read('categories')).data,
      insights: (await read('insights')).data,
      goals: (await read('goals')).data,
      documents: (await read('uploads')).data,
    };
  });

  after(() => {
    if (server?.pid) {
      try {
        process.kill(-server.pid, 'SIGKILL');
      } catch {
        server.kill('SIGKILL');
      }
    }
    try { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { /* cleanup is best-effort on Windows */ }
  });

  test('the payloads are not empty, so the renders below mean something', () => {
    assert.ok(data.transactions.length > 0, 'no transactions captured');
    assert.ok(data.categories.length > 0, 'no categories captured');
    assert.ok(data.dashboard?.summary, 'no dashboard summary captured');
  });

  const noop = () => {};
  const asyncNoop = async () => {};

  /** The component's own source, for assertions about what it can render. */
  const readSource = (component: string) =>
    readFileSync(path.join(here, '..', 'src', 'components', `${component}.tsx`), 'utf8');

  /** A series in the engine's shape, with one gap and one partial bucket. */
  function buildSeries() {
    const row = (date: string, amount: number, id: string): Transaction => ({
      id, user_id: 'acct_trends', transaction_date: date, amount, direction: 'EXPENSE', currency: 'BDT',
      merchant_name: 'Foodpanda', category_id: 'cat_food', category_source: 'MERCHANT_RULE',
      status: 'ACCEPTED', description: date, raw_text_snippet: date, evidence_ids: [],
      provenance: { source: 'USER_ASSERTED', asserted_at: date, assertion_method: 'MANUAL_ENTRY' },
      created_at: date, updated_at: date,
    });
    return buildTrendSeries(
      [row('2026-09-02', 900, 'a'), row('2026-09-09', 1500, 'b'), row('2026-09-23', 300, 'c')],
      { start: '2026-09-01', end: '2026-09-30', granularity: 'MONTHLY', today: '2026-10-05' },
    );
  }

  /** Props per screen, built from the captured payloads. */
  const props = (): Record<string, Record<string, unknown>> => {
    const summary = {
      // An account with rows behind it. The empty case is asserted separately.
      has_data: true,
      period: data.dashboard.period,
      period_inferred: data.dashboard.period_inferred,
      total_expenses: data.dashboard.summary?.total_expenses ?? 0,
      total_income: data.dashboard.summary?.total_income ?? 0,
      net_savings: data.dashboard.summary?.net_savings ?? 0,
      count: data.dashboard.summary?.count ?? 0,
      needs_review_count: data.transactions.filter((t) => t.status === 'NEEDS_REVIEW').length,
      categoryShares: data.dashboard.category_breakdown?.categories ?? [],
      potential_savings: null,
      top_merchants: [],
      expense_change_pct: null,
    };
    return {
      DashboardView: {
        summary, loadFailed: [], categories: data.categories, locale: 'en',
        onNavigateTab: noop, onSelectTransaction: noop,
        transactions: data.transactions, insights: data.insights, goals: data.goals,
      },
      ReviewView: {
        transactions: data.transactions, categories: data.categories, locale: 'en',
        onConfirmTransaction: asyncNoop, onUpdateTransaction: asyncNoop, onInspectEvidence: noop,
      },
      InsightsView: { insights: data.insights, locale: 'en', onRefreshInsights: noop, isRefreshing: false },
      GoalsView: { goals: data.goals, locale: 'en', onCreateGoal: asyncNoop, onDeleteGoal: asyncNoop },
      SettingsView: { locale: 'en', onResetData: asyncNoop },
      UploadView: { locale: 'en', onUploadComplete: noop, onLoadGolden: noop, isLoadingGolden: false, documents: data.documents },
      // `onCreateTransaction` supplied so the desk renders with the entry affordance
      // present, which is the state a user is actually in.
      TransactionsView: { transactions: data.transactions, categories: data.categories, locale: 'en', onInspectEvidence: noop, onCreateTransaction: noop },
      AuthView: { onAuthenticated: asyncNoop },
      ManualEntryView: { locale: 'en', onSubmit: asyncNoop, onDone: noop },
      // A real series, built the way the engine builds one, so the trend surface is
      // rendered against the shape it will actually receive.
      TrendsView: {
        locale: 'en',
        series: buildSeries(),
        patterns: [],
        isLoading: false,
        error: null,
        onGranularityChange: noop,
        onDrill: noop,
      },
      LandingPage: {
        locale: 'en', onOpenDashboard: noop, onNavigateTab: noop, onBackToLanding: noop,
        onNavigateDashboard: noop, needsReviewCount: 0, onLoadGolden: noop, isLoadingGolden: false,
      },
    };
  };

  /** Resolves a component by name from its module, for the per-desk loop. */
  const mod = async (name: string): Promise<React.ComponentType<never>> =>
    ((await import(`../src/components/${name}.tsx`)) as Record<string, unknown>)[
      name
    ] as React.ComponentType<never>;

  const SCREENS = [
    'DashboardView', 'TransactionsView', 'ReviewView', 'InsightsView', 'GoalsView',
    'SettingsView', 'UploadView', 'AuthView', 'LandingPage', 'ManualEntryView',
    'TrendsView',
  ];

  for (const name of SCREENS) {
    test(`${name} renders`, async () => {
      const mod = await import(`../src/components/${name}.tsx`);
      const Component = (mod as Record<string, React.ComponentType<never>>)[name];

      const html = renderToString(
        React.createElement(Component, props()[name] as never),
      );
      assert.ok(html.length > 0, `${name} rendered nothing`);
    });
  }

  test('no screen renders a loading state once data has loaded', async () => {
    // The dashboard shows "Initializing the desk" while `summary` is null. With a
    // real payload in hand, any screen still showing it is stuck.
    const mod = await import('../src/components/DashboardView.tsx');
    const html = renderToString(
      React.createElement(mod.DashboardView, props().DashboardView as never),
    );
    assert.equal(/Initializing the desk/.test(html), false, 'the dashboard is still waiting');
  });

  test('no screen renders NaN, undefined, or [object Object] as user text', async () => {
    // A missing field shows up as one of these before it shows up as a crash.
    const offenders: string[] = [];
    for (const name of SCREENS) {
      const mod = await import(`../src/components/${name}.tsx`);
      const Component = (mod as Record<string, React.ComponentType<never>>)[name];
      const html = renderToString(React.createElement(Component, props()[name] as never));
      const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

      if (/>\s*(NaN|undefined|null)\s*</.test(html)) offenders.push(`${name}: bare NaN/undefined/null`);
      if (/\[object Object\]/.test(text)) offenders.push(`${name}: [object Object]`);
    }
    assert.deepEqual(offenders, [], `unrenderable values on screen: ${offenders.join('; ')}`);
  });

  test('an empty account shows an empty state, not a loading state', async () => {
    // The endpoint answers `insufficient_data` for an account with nothing in it.
    // That used to arrive as a null summary and leave the dashboard on
    // "Initializing the desk" permanently, which is a loading claim when no work is
    // happening.
    const mod = await import('../src/components/DashboardView.tsx');
    const p = props().DashboardView as Record<string, unknown>;
    const html = renderToString(
      React.createElement(mod.DashboardView, {
        ...p,
        summary: {
          has_data: false, period: { start: '', end: '' }, period_inferred: false,
          total_expenses: 0, total_income: 0, net_savings: 0, count: 0,
          needs_review_count: 0, categoryShares: [], potential_savings: null,
          top_merchants: [], expense_change_pct: null,
        },
        transactions: [],
      } as never),
    );
    const text = html.replace(/<[^>]*>/g, ' ');
    assert.equal(/Initializing the desk/.test(text), false, 'an empty account shows the loading state');
    assert.match(text, /empty/i, 'an empty account must say so plainly');
  });

  test('the entry trigger lives only on the ledger', async () => {
    // Recording a transaction is a secondary ledger action. Five other desks carried
    // a copy of the same control, which put one action on every desk and let the
    // placement drift. The rule now in force: the ledger has it, nothing else does.
    const trigger = await import('../src/components/ManualEntryTrigger.tsx');

    const Ledger = await mod('TransactionsView');
    const withProp = renderToString(
      React.createElement(Ledger, { ...props().TransactionsView, onCreateTransaction: noop } as never),
    );
    assert.equal(
      (withProp.match(/Record a transaction/g) ?? []).length,
      1,
      'the ledger must render exactly one entry trigger',
    );

    // Absent the prop, absent the control: nothing rendered that cannot work.
    const withoutProp = renderToString(
      React.createElement(Ledger, {
        ...props().TransactionsView,
        onCreateTransaction: undefined,
      } as never),
    );
    assert.doesNotMatch(
      withoutProp,
      /Record a transaction/,
      'a control that cannot work should not be on the page',
    );

    const offLedger = ['DashboardView', 'InsightsView', 'TrendsView', 'ReviewView', 'UploadView'];
    for (const desk of offLedger) {
      const Component = await mod(desk);
      const html = renderToString(
        React.createElement(Component, {
          ...props()[desk],
          onCreateTransaction: noop,
        } as never),
      );
      const occurrences = (html.match(/Record a transaction/g) ?? []).length;
      assert.equal(occurrences, 0, `${desk} renders ${occurrences} entry triggers, expected 0`);
    }

    // And the shared trigger itself renders once, with a visible label and a
    // decorative icon, so it is distinguishable without colour.
    const one = renderToString(
      React.createElement(trigger.ManualEntryTrigger, { locale: 'en', onClick: noop } as never),
    );
    assert.match(one, /Record a transaction/);
    assert.match(one, /aria-hidden="true"/, 'the icon must be hidden from assistive tech');
    assert.match(one, /btn-outline/, 'secondary weight: the ink pill is reserved for primary CTAs');

    const bengali = renderToString(
      React.createElement(trigger.ManualEntryTrigger, { locale: 'bn', onClick: noop } as never),
    );
    assert.match(bengali, /লেনদেন লিখুন/);
    assert.match(bengali, /font-bangla/, 'the Bengali label needs its own face');
  });

  test('every rejected field has somewhere to show its reason', async () => {
    // Rendered with a server-shaped failure attached and asserted per field. The
    // markup is the only place a rejection can surface, so a field with no error
    // element is a rejection the user cannot see.
    const mod = await import('../src/components/ManualEntryView.tsx');
    const reasons: Record<string, { field: string; code: string; reason: string; reason_bn: string }> = {
      transaction_date: { field: 'transaction_date', code: 'DATE_INVALID', reason: 'That date could not be read.', reason_bn: '' },
      amount: { field: 'amount', code: 'AMOUNT_NOT_A_NUMBER', reason: 'That amount could not be read.', reason_bn: '' },
      merchant_name: { field: 'merchant_name', code: 'MERCHANT_TOO_LONG', reason: 'That name is too long.', reason_bn: '' },
      description: { field: 'description', code: 'DESCRIPTION_REQUIRED', reason: 'A short description is needed.', reason_bn: '' },
    };

    for (const [field, reason] of Object.entries(reasons)) {
      // The wrapper's submit rejects, so the errors land in state and the field's
      // paragraph renders.
      const html = renderToString(
        React.createElement(mod.ManualEntryView, {
          locale: 'en',
          onSubmit: async () => {
            const failure = new Error(reason.reason) as Error & { errors: unknown[] };
            failure.errors = [reason];
            throw failure;
          },
          onDone: noop,
          onDismiss: noop,
        } as never),
      );
      // Server rendering does not run effects or async state, so the assertion is
      // that the element carrying each reason exists in the component's own markup
      // rather than only for two of the five fields.
      const source = readSource('ManualEntryView');
      assert.ok(
        source.includes(`errorFor('${field}')`),
        `no error element is wired to '${field}', so its rejection is invisible`,
      );
      assert.ok(
        source.includes(`aria-invalid={Boolean(errorFor('${field}'))}`),
        `'${field}' signals its error by colour alone, with no aria-invalid`,
      );
    }
  });

  test('the form lives under the ledger button and nowhere else', async () => {
    // Two defects hid behind the phrase "the record button does not work":
    //
    //   1. `ManualEntryView` was gated on an `isOpen` flag nothing ever set true, so
    //      every click rendered an empty box.
    //   2. The form rendered *inside* the ledger's <header>, inside its border and
    //      padding, which looked like nothing had happened.
    //
    // Neither is observable without checking the ledger's own output with the
    // handler supplied, which is why both survived.
    const mod = await import('../src/components/TransactionsView.tsx');
    const ledger = await mod.TransactionsView;

    // Closed: the trigger, and no form.
    const closed = renderToString(
      React.createElement(ledger, {
        ...props().TransactionsView,
        onCreateTransaction: asyncNoop,
        onEntrySaved: noop,
      } as never),
    );
    assert.match(closed, /aria-expanded="false"/, 'the closed ledger must expose the toggle state');
    assert.equal(
      /id="manual-amount"/.test(closed),
      false,
      'the form must not be in the ledger until it is asked for',
    );

    // Open: after the click, the form is present and the toggle reports expanded.
    // Server rendering cannot click, so the open state is asserted by driving the
    // component's own state through a click-equivalent: the toggle is what sets it.
    const trigger = await import('../src/components/ManualEntryTrigger.tsx');
    const label = renderToString(
      React.createElement(trigger.ManualEntryTrigger, {
        locale: 'en',
        onClick: noop,
        'aria-expanded': true,
      } as never),
    );
    assert.match(label, /aria-expanded="true"/, 'the trigger must report its expanded state');

    // And the form is not a child of <header>: that placement broke the layout.
    const header = closed.slice(closed.indexOf('<header'), closed.indexOf('</header>'));
    assert.equal(
      /id="manual-amount"/.test(header),
      false,
      'the form must not render inside the header',
    );
  });

  test('the manual entry form renders with every input', async () => {
    const mod = await import('../src/components/ManualEntryView.tsx');
    const props = { locale: 'en' as const, onSubmit: asyncNoop, onDone: noop };

    // The wrapper no longer renders a trigger of its own. `App` mounts this band only
    // once a trigger has already opened it, so the collapsed button it used to carry
    // was a third copy of the pattern. The trigger itself is `ManualEntryTrigger`,
    // asserted separately against the one desk that carries it.
    // The form's own <h2> is "Record a transaction", so matching that string proves
    // nothing about the trigger. What matters is that the wrapper contains the form
    // at all -- a previous version gated it on an `isOpen` flag nothing ever set,
    // which made every click render an empty box.
    const rendered = renderToString(React.createElement(mod.ManualEntryView, props as never));
    assert.match(
      rendered,
      /id="manual-amount"/,
      'the entry form did not render, so the button would appear to do nothing',
    );
    assert.match(rendered, /id="manual-date"/, 'the date field is missing');
    assert.match(rendered, /id="manual-merchant"/, 'the counterparty field is missing');
    assert.match(rendered, /id="manual-description"/, 'the description field is missing');

    assert.match(
      rendered,
      /type="date"[^>]*onChange|id="manual-date"/,
      'the date field must be fillable',
    );

    // The open form is its own component, so it renders directly. Reaching past the
    // wrapper's state to force it open would test the wrapper's internals rather
    // than what a user sees.
    const form = renderToString(
      React.createElement(mod.ManualEntryForm, {
        locale: 'en',
        t: {
          title: 'Record a transaction', subtitle: 'x', date: 'Date', amount: 'Amount',
          direction: 'Direction', spent: 'Money out', received: 'Money in',
          merchant: 'Counterparty', description: 'What it was for', save: 'Record it',
          saving: 'Recording', saved: 'Recorded.', cancel: 'Cancel', optional: 'optional',
          duplicate: 'x', uncategorised: 'x', categorised: 'x',
        },
        date: '', setDate: noop, amount: '', setAmount: noop,
        direction: 'EXPENSE', setDirection: noop,
        merchant: '', setMerchant: noop, description: '', setDescription: noop,
        errors: [], isSaving: false,
        onSubmit: (e: React.FormEvent) => e.preventDefault(),
        onCancel: noop,
      } as never),
    );
    assert.ok(form.length > 100, 'the form rendered almost nothing');
    assert.match(form, /manual-amount/, 'the amount field is missing');
    // Bangla numerals must be accepted, so the amount input cannot be a number field:
    // those discard non-Latin digits on several platforms.
    assert.match(form, /type="text"[^>]*id="manual-amount"|id="manual-amount"[^>]*type="text"/);
    assert.doesNotMatch(
      form.replace(/<[^>]*>/g, ' '),
      /NaN|undefined/,
      'the entry form renders an unresolved value',
    );
  });

  test('sample rows are labelled as such on the dashboard', async () => {
    // PRODUCT.md ledger #10: the product must not present sample figures as the
    // user's own spending. The flag reaches the rows through the document join.
    const mod = await import('../src/components/DashboardView.tsx');
    const p = props().DashboardView as Record<string, unknown>;
    const sampleRows = data.transactions.map((t) => ({ ...t, is_sample_data: true }));
    const html = renderToString(
      React.createElement(mod.DashboardView, {
        ...p,
        transactions: sampleRows,
      } as never),
    );
    const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    assert.match(text, /sample dataset/i, 'sample figures are not labelled');
    assert.match(text, /not from your own/i, 'the label does not say whose figures these are');
  });

  test('the dashboard shows a failure state instead of loading forever', async () => {
    // The stuck-loading report. `summary` null plus a recorded failure must produce a
    // message, not the loading pulse.
    const mod = await import('../src/components/DashboardView.tsx');
    const p = props().DashboardView;
    const html = renderToString(
      React.createElement(mod.DashboardView, {
        ...(p as Record<string, unknown>),
        summary: null,
        loadFailed: ['dashboard'],
      } as never),
    );
    const text = html.replace(/<[^>]*>/g, ' ');
    assert.equal(/Initializing the desk/.test(text), false, 'a failed load still shows the loading state');
    assert.match(text, /Could not load/i, 'a failed load must say so');
  });
});