import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { extractPdfText, pdfPlainText, pageForLine, MAX_PDF_BYTES } from './pdfExtract';
import { parseRow } from './rowParse';
import { inspectUpload, rejectionMessage } from './uploadValidation';

/**
 * Spec 002, User Story 1 — a real statement is read correctly.
 *
 * The PDFs here are constructed byte by byte rather than checked in as fixtures, so
 * the test states exactly what it is asserting: a one-page PDF with a real text
 * layer, and one with the text layer stripped.
 *
 * The behaviour under test is the one that was missing entirely. The client posted
 * `await file.text()`, which decodes PDF binary as UTF-8 and destroys the text layer,
 * so the server received binary noise and refused almost every PDF as a scan.
 */

const FONT = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

/**
 * Builds a valid single-page PDF whose content stream draws `lines` as text.
 *
 * The xref offsets are computed from the assembled file rather than faked, because
 * pdf.js validates them: a PDF with wrong offsets is "corrupt", which is a different
 * failure from the one under test.
 */
function buildPdf(lines: string[], withTextLayer = true): string {
  const content = withTextLayer
    ? `BT /F1 12 Tf 40 700 Td 14 TL ${lines.map((l) => `(${l}) Tj T*`).join(' ')} ET`
    : '';

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    FONT,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(pdf, 'binary').toString('base64');
}

const STATEMENT = [
  '01/09/2026 250.00 Foodpanda',
  '02/09/2026 1,250.50 Chaldal',
  '03/09/2026 4,500.00 Shwapno',
  '15/09/2026 Credit Salary 85,000.00',
];

describe('PDF text extraction', () => {
  test('reads the text layer of a real PDF', async () => {
    const result = await extractPdfText(buildPdf(STATEMENT));

    assert.equal(result.ok, true, `a text PDF must extract: ${result.reason} ${result.message ?? ''}`);
    assert.equal(result.pages.length, 1);
    assert.ok(result.pages[0].text.includes('Foodpanda'), 'the merchant text did not come through');
  });

  test('the extracted text parses into the right rows', async () => {
    const result = await extractPdfText(buildPdf(STATEMENT));
    const text = pdfPlainText(result);

    const rows = text
      .split('\n')
      .map((line) => parseRow(line))
      .filter((r) => r !== null && r.date !== null && r.amount !== null);

    assert.equal(rows.length, 4, `expected 4 rows, got ${rows.length}`);
    assert.equal(rows[0]!.date, '2026-09-01');
    assert.equal(rows[0]!.amount, 250);
    assert.equal(rows[1]!.amount, 1250.5);
    assert.equal(rows[3]!.direction, 'INCOME');
    assert.equal(rows[3]!.amount, 85000);
  });

  test('page numbers are real and 1-based', async () => {
    const result = await extractPdfText(buildPdf(STATEMENT));
    assert.equal(result.pages[0].pageNumber, 1, 'page numbers must be 1-based as printed');

    // And a line can be located, so evidence can cite a page instead of inventing one.
    assert.equal(pageForLine(result, '01/09/2026 250.00 Foodpanda'), 1);
  });

  test('a PDF with no text layer is reported, never guessed at', async () => {
    // The scanned-statement case. It must be a plain rejection naming what to do, not
    // an empty extraction that reads as "you spent nothing".
    const result = await extractPdfText(buildPdf([], false));

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'no_text_layer');
    assert.match(result.message!, /no readable text/i);
    assert.match(result.message!, /text PDF|JPG|PNG/i, 'the message must say what to do instead');
  });

  test('a corrupt file is refused with a sentence, not a library error', async () => {
    const result = await extractPdfText(Buffer.from('%PDF-1.4\nnot a real pdf at all').toString('base64'));
    assert.equal(result.ok, false);
    // The library's message names internal objects; it must not reach the user.
    assert.doesNotMatch(result.message ?? '', /xref|PDFDocumentProxy|undefined/i);
  });

  test('an empty payload is refused', async () => {
    const result = await extractPdfText('');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'empty');
  });

  test('an oversized PDF is refused before parsing', async () => {
    const huge = 'A'.repeat(Math.ceil((MAX_PDF_BYTES * 4) / 3) + 16);
    const result = await extractPdfText(huge);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'too_large');
  });

  test('extracted text passes the upload validator', async () => {
    // The route inspects extracted text rather than the raw bytes. This is the join
    // that makes that safe: text that the validator would reject must not reach the
    // parser either.
    const result = await extractPdfText(buildPdf(STATEMENT));
    const text = pdfPlainText(result);

    const inspection = inspectUpload(text, false);
    assert.equal(inspection.readable, true, `extracted text was rejected: ${rejectionMessage(inspection)}`);
  });

  test('a rejected PDF never yields text that would parse as rows', async () => {
    const result = await extractPdfText(buildPdf([], false));
    const text = result.ok ? pdfPlainText(result) : '';
    const rows = text.split('\n').map((l) => parseRow(l)).filter((r) => r?.date && r?.amount);
    assert.deepEqual(rows, [], 'a rejected PDF must produce no rows');
  });
});
