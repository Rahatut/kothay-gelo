/**
 * Upload validation.
 *
 * Performed at the route boundary, before anything is parsed, stored, or sent to
 * a model. Three rules:
 *
 *   1. Type is determined by inspecting content, never by the filename extension
 *      or the browser-supplied MIME type. Both are attacker-controlled, and the
 *      previous route validated the filename alone.
 *   2. Size is bounded against the same limit the interface advertises, so the
 *      stated limit is the enforced one.
 *   3. A file that is not readable as text is refused with a message naming a
 *      next step, rather than being parsed into zero rows and reported as an
 *      empty statement.
 */

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export type DetectedKind = 'PDF' | 'IMAGE' | 'TEXT' | 'BINARY';

export interface Inspection {
  kind: DetectedKind;
  byteSize: number;
  /** True when the content is plausible for the detected kind. */
  readable: boolean;
  /** Plain text to parse, when the content is textual. Empty otherwise. */
  text: string;
  reason?: string;
}

/** PDF files begin with the `%PDF-` marker, which is a content fact, not a claim. */
const PDF_MAGIC = '%PDF-';

const IMAGE_SIGNATURES: { bytes: number[]; mime: string }[] = [
  { bytes: [0xff, 0xd8, 0xff], mime: 'image/jpeg' },
  { bytes: [0x89, 0x50, 0x4e, 0x47], mime: 'image/png' },
  { bytes: [0x47, 0x49, 0x46, 0x38], mime: 'image/gif' },
];

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((byte, i) => bytes[i] === byte);
}

/**
 * Identifies an upload by its content.
 *
 * `content` is the raw text the client sent, or a base64 payload for an image.
 * The function reports what the bytes actually are rather than what they were
 * labelled.
 */
export function inspectUpload(
  content: string,
  isBase64Image: boolean,
  declaredMime?: string,
): Inspection {
  const byteSize = Buffer.byteLength(content ?? '', 'utf8');

  if (byteSize === 0) {
    return { kind: 'BINARY', byteSize, readable: false, text: '', reason: 'empty' };
  }

  if (byteSize > MAX_UPLOAD_BYTES) {
    return {
      kind: 'BINARY',
      byteSize,
      readable: false,
      text: '',
      reason: 'too_large',
    };
  }

  if (isBase64Image) {
    // Base64 decodes 3 characters to 2 bytes, so slicing to the signature
    // length in base64 characters yields fewer bytes than the signature needs
    // and the check silently never matched. 8 characters decode to 6, which
    // covers every signature below.
    const header = content.slice(0, 8);
    const isKnownImage = IMAGE_SIGNATURES.some((sig) => {
      try {
        return startsWith(Buffer.from(header, 'base64'), sig.bytes);
      } catch {
        return false;
      }
    });
    if (isKnownImage) {
      return { kind: 'IMAGE', byteSize, readable: true, text: content };
    }
    // A base64 payload that is not a known image signature is refused rather
    // than handed to the model, which would describe whatever it decoded to.
    return {
      kind: 'BINARY',
      byteSize,
      readable: false,
      text: '',
      // A stable reason key, so `rejectionMessage` can match it. The previous
      // value interpolated the MIME type into the string, and the switch below
      // compared a literal, so both image messages were unreachable and the
      // "upload a JPG or PNG" guidance never reached a user.
      reason: 'unrecognised image data',
    };
  }

  // A PDF arrives as text and still starts with the marker, so it is detectable.
  if (content.trimStart().startsWith(PDF_MAGIC)) {
    // A PDF with no text layer: a scan, or a file that was only half copied.
    // The route receives the extracted text, so "no figures at all" means
    // there is nothing to extract. Without this check it passed as readable and
    // was reported to the user as an empty statement, which reads as "you spent
    // nothing" rather than "I could not read your file".
    // What a text PDF always carries and a scan or a truncated copy never
    // carries is prose and figures on the page.
    //
    // This deliberately does not look for a date. An earlier version required a
    // numeric date, which rejected perfectly good statements written as
    // `01 Sep 2026 250.00 Foodpanda` and told the user to re-export a file that
    // needed no re-exporting. The question here is only whether there is text to
    // read, not whether this parser understands its format.
    // A bare PDF structure carries around 30 alphanumerics; one statement row
    // carries more than that on its own. An earlier version asked only for a
    // 6-character run, which `<< /Type /Catalog >>` satisfies, so the file the
    // check exists to reject passed it.
    const alphanumerics = content.replace(/[^\p{L}\p{N}]/gu, '').length;
    if (alphanumerics < 40) {
      return {
        kind: 'PDF',
        byteSize,
        readable: false,
        text: '',
        reason: 'no text layer in PDF',
      };
    }
    return { kind: 'PDF', byteSize, readable: true, text: content };
  }

  // Text that is valid UTF-8 and mostly printable is parseable. A PDF read
  // through a text reader arrives as binary noise, which this rejects.
  const printable = countPrintable(content);
  const ratio = printable / content.length;
  if (ratio < 0.85) {
    return {
      kind: 'BINARY',
      byteSize,
      readable: false,
      text: '',
      reason: 'not text; likely a scanned or binary file',
    };
  }

  return { kind: 'TEXT', byteSize, readable: true, text: content };
}

/**
 * Counts characters that could legitimately appear in a text statement.
 *
 * U+FFFD, the replacement character, is excluded. It is what unreadable bytes
 * decode to, so a PDF read through a text reader arrives as a wall of it -- and
 * `code >= 32` counts every one of those as printable. The binary check then
 * passed the file it exists to reject, the parser found no rows, and the user was
 * told their statement recorded no spending.
 */
function countPrintable(text: string): number {
  let printable = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    const isPrintable =
      code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 0x7f && code !== 0xfffd);
    if (isPrintable) printable++;
  }
  return printable;
}

/** The user-facing message for an unreadable upload, with a next step. */
export function rejectionMessage(inspection: Inspection): string {
  switch (inspection.reason) {
    case 'empty':
      return 'That file is empty. Choose the original statement and try again.';
    case 'too_large':
      // Exact byte counts as well as the rounded figure: at 1 MB over the limit,
      // both round to the same string and the message reads as if they matched.
      return (
        `That file is ${formatBytes(inspection.byteSize)} ` +
        `(${inspection.byteSize.toLocaleString()} bytes). The limit is ` +
        `${formatBytes(MAX_UPLOAD_BYTES)} (${MAX_UPLOAD_BYTES.toLocaleString()} bytes), ` +
        'so nothing was uploaded.'
      );
    case 'unrecognised image data':
      return 'That file is not a JPG or PNG image. Upload a text-based PDF, or a JPG or PNG photo of the statement.';
    case 'no text layer in PDF':
      return 'That PDF has no readable text, so no transactions could be read from it. Export it from bKash or your bank as a text PDF rather than a scan.';
    case 'not text; likely a scanned or binary file':
      return 'That file has no readable text, so no transactions could be read from it. Upload the original PDF rather than a scan or a photo.';
    default:
      return 'That file could not be read. Upload the original statement as a text-based PDF or CSV.';
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
