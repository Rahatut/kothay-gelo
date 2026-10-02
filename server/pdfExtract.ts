import { extractText } from 'unpdf';

/**
 * PDF text extraction.
 *
 * This is the whole of spec 002 User Story 1, and it exists because the PDF text
 * layer was never being read. The client did `await selectedFile.text()`, which for
 * a PDF decodes the binary as UTF-8 and loses everything that is not valid UTF-8 --
 * so the streams and the compressed content never came out as text. What arrived was
 * binary noise, which is why the upload validator had to reject "no text layer in
 * PDF" as a distinct failure mode: almost every PDF looked like a scan.
 *
 * So the bytes are posted as base64 and the text is extracted here, server-side,
 * where a real parser is available. `unpdf` is a wrapper around pdf.js.
 *
 * Two properties this holds:
 *
 *   - A PDF with no text layer is reported as such and never guessed at. The
 *     distinction between "a PDF whose text could not be read" and "a scan" is the
 *     difference between a user being told to export again and being told to find
 *     the original.
 *   - Page numbers come from pdf.js and are recorded. They are real geometry, unlike
 *     the synthesised `y: 100 + i * 36` boxes removed in spec 001.
 *
 * No OCR. PRODUCT.md ledger #3 permanently bars it, and a scanned statement is a
 * plain rejection rather than a slow, wrong, expensive guess.
 */

/** A base64 payload larger than this is refused before parsing. */
export const MAX_PDF_BYTES = 25 * 1024 * 1024;

export interface PdfTextPage {
  /** 1-based, as printed on the page. */
  pageNumber: number;
  text: string;
}

export interface PdfExtraction {
  ok: boolean;
  pages: PdfTextPage[];
  /** Non-empty when the file could not be read. */
  reason?: string;
  /** A sentence for the user. Never a library error string. */
  message?: string;
  byteSize?: number;
}

/** Decodes a base64 payload, or null when it is not decodable. */
function decodeBase64(payload: string): Uint8Array | null {
  try {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Reads the text layer of a PDF.
 *
 * `pdfBase64` is the file, not text read from it. Pages with no text are kept with
 * an empty string rather than dropped, so page numbering stays true to the document.
 */
export async function extractPdfText(pdfBase64: string): Promise<PdfExtraction> {
  if (typeof pdfBase64 !== 'string' || pdfBase64.length === 0) {
    return {
      ok: false,
      pages: [],
      reason: 'empty',
      message: 'That file is empty. Choose the original statement and try again.',
    };
  }

  // Base64 inflates by 4/3, so the encoded length bounds the decoded one.
  const approxBytes = Math.floor((pdfBase64.length * 3) / 4);
  if (approxBytes > MAX_PDF_BYTES) {
    return {
      ok: false,
      pages: [],
      reason: 'too_large',
      byteSize: approxBytes,
      message: `That PDF is about ${(approxBytes / 1024 / 1024).toFixed(1)} MB. The limit is ${(
        MAX_PDF_BYTES / 1024 / 1024
      ).toFixed(0)} MB.`,
    };
  }

  const bytes = decodeBase64(pdfBase64);
  if (!bytes) {
    return {
      ok: false,
      pages: [],
      reason: 'unreadable',
      message: 'That file could not be read. Try exporting it again from your bank or wallet.',
    };
  }

  // `mergePages: false` returns `{ totalPages, text: string[] }`. Handling the object
  // shape matters: joining it as a string produced the literal "[object Object]" for
  // every page, which then read as "no text layer" and rejected a perfectly good PDF.
  let perPage: string[] = [];
  try {
    const result = await extractText(bytes, { mergePages: false });
    if (Array.isArray(result)) {
      perPage = result.map(String);
    } else if (result && typeof result === 'object' && Array.isArray(result.text)) {
      perPage = result.text.map(String);
    } else {
      perPage = [String(result)];
    }
  } catch (err) {
    // A corrupt or encrypted file. The library's message is not shown: it names
    // internal objects and does not tell the user what to do.
    return {
      ok: false,
      pages: [],
      reason: 'corrupt',
      byteSize: bytes.length,
      message:
        'That PDF could not be opened. It may be damaged or password-protected. ' +
        'Export a fresh copy from your bank or wallet and try again.',
    };
  }

  const pages: PdfTextPage[] = perPage.map((text, i) => ({
    pageNumber: i + 1,
    text: text.replace(/\n{3,}/g, '\n\n').trim(),
  }));

  const printable = pages.reduce((sum, p) => sum + p.text.replace(/\s/g, '').length, 0);

  if (printable < 20) {
    // Too little to be a statement. Almost always a scan or an image-only export.
    return {
      ok: false,
      pages,
      reason: 'no_text_layer',
      byteSize: bytes.length,
      message:
        'That PDF has no readable text, so no transactions could be read from it. ' +
        'Export it as a text PDF rather than a scan, or upload a JPG or PNG of the statement.',
    };
  }

  return { ok: true, pages, byteSize: bytes.length };
}

/** The document text handed to the parsers, with pages joined by newlines. */
export function pdfPlainText(extraction: PdfExtraction): string {
  return extraction.pages.map((p) => p.text).join('\n');
}

/** Finds which page a source line came from, for evidence that can cite it. */
export function pageForLine(extraction: PdfExtraction, line: string): number | null {
  const needle = line.trim().slice(0, 40);
  if (!needle) return null;
  for (const page of extraction.pages) {
    if (page.text.includes(needle)) return page.pageNumber;
  }
  return null;
}
