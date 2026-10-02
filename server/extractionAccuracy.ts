import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseRow, type ParsedRow } from './rowParse';
import { roundMoney } from './financialEngine';

/**
 * Row-extraction accuracy, measured against reference data.
 *
 * Both the accuracy test and the PRODUCT.md metric harness call this, so the
 * number the test asserts and the number the report prints cannot drift apart.
 *
 * The comparison is against `.truth.csv` files sitting beside each fixture: the
 * expected date, amount, direction, and merchant for every row, held as data.
 * Comparing the parser against itself measures nothing -- an earlier version of
 * this filtered each fixture line through `parseRow` to decide which rows were
 * recoverable, then filtered the same lines through `parseRow` again to count
 * them, and reported 100% on fixtures whose every amount had been replaced with
 * 99999999.00.
 *
 * A row counts as correct only when all four fields match. A row with the right
 * date and the wrong amount is not a partially correct transaction; it is a false
 * record in a money ledger.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURE_DIR = path.join(here, '..', 'tests', 'fixtures', 'ground-truth');

export interface TruthRow {
  date: string;
  amount: number;
  direction: string;
  merchant: string;
}

export interface FixtureAccuracy {
  file: string;
  rows: number;
  correct: number;
  accuracy: number;
  wrong: string[];
}

/** The fixture files, excluding their reference files. */
export function listFixtures(): string[] {
  return readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith('.csv') && !f.endsWith('.truth.csv'))
    .sort();
}

export function readTruth(file: string): TruthRow[] {
  const lines = readFileSync(path.join(FIXTURE_DIR, file.replace(/\.csv$/, '.truth.csv')), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const header = lines.shift();
  if (header !== 'date,amount,direction,merchant') {
    throw new Error(`${file} has no reference header`);
  }
  return lines.map((line) => {
    const [date, amount, direction, merchant] = line.split(',');
    return { date, amount: Number(amount), direction, merchant };
  });
}

function readFixtureLines(file: string): string[] {
  return readFileSync(path.join(FIXTURE_DIR, file), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    // A row is identified by carrying a date, not by starting with one: the wallet
    // fixture prefixes every row with a TrxID. Anchoring the pattern dropped all
    // 33 of them and the gate read 0% against a correct parser.
    .filter((l) => l.length > 0 && /\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/.test(l));
}

/** Measures one fixture against its reference file. */
export function measureFixture(file: string): FixtureAccuracy {
  const truth = readTruth(file);
  if (truth.length === 0) {
    throw new Error(`${file} has no reference rows; the fixture is empty`);
  }

  const parsed = readFixtureLines(file)
    .map((line) => parseRow(line))
    .filter((r): r is ParsedRow => r !== null && r.date !== null && r.amount !== null);

  const wrong: string[] = [];
  let correct = 0;

  for (const [i, want] of truth.entries()) {
    const got = parsed[i];
    if (
      got &&
      got.date === want.date &&
      roundMoney(got.amount ?? -1) === roundMoney(want.amount) &&
      got.direction === want.direction
    ) {
      correct++;
    } else {
      wrong.push(
        `row ${i + 1}: expected ${want.date} ${want.amount} ${want.direction}, ` +
          `got ${got ? `${got.date} ${got.amount} ${got.direction}` : 'no row'}`,
      );
    }
  }

  // Rows the parser invented are as wrong as rows it missed.
  for (const extra of parsed.slice(truth.length)) {
    wrong.push(`extra row: ${extra.date} ${extra.amount} ${extra.direction}`);
    correct = Math.max(0, correct - 1);
  }

  return { file, rows: truth.length, correct, accuracy: correct / truth.length, wrong };
}

/** Measures every fixture and the overall figure. */
export function measureAll(): { fixtures: FixtureAccuracy[]; rows: number; correct: number; accuracy: number } {
  const fixtures = listFixtures().map(measureFixture);
  const rows = fixtures.reduce((sum, f) => sum + f.rows, 0);
  const correct = fixtures.reduce((sum, f) => sum + f.correct, 0);
  return { fixtures, rows, correct, accuracy: rows === 0 ? 0 : correct / rows };
}
