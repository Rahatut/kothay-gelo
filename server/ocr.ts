import { createWorker, type Worker } from 'tesseract.js';

/**
 * OCR for statement photos.
 *
 * Image uploads previously had no reader behind them: without a Gemini key the
 * pipeline ran its text parser over the base64 payload and filed an upload that
 * "completed" with zero candidates. The bytes must first become text.
 *
 * PRODUCT.md previously barred OCR; the owner re-opened the scope because a
 * photo of a statement is the only input some users have. A scanned statement
 * is therefore read rather than refused, and the read carries no confidence it
 * did not earn -- every row still goes through the deterministic parser and
 * its own confidence derivation.
 */

let worker: Worker | null = null;

async function getWorker(): Promise<Worker> {
  if (worker) return worker;
  worker = await createWorker('eng');
  return worker;
}

/** Reads text out of a base64-encoded statement photo. */
export async function ocrImageBase64(base64: string): Promise<string> {
  const w = await getWorker();
  const buffer = Buffer.from(base64, 'base64');
  const { data } = await w.recognize(buffer);
  return data.text ?? '';
}

export async function closeOcrWorker(): Promise<void> {
  if (worker) {
    await worker.terminate();
    worker = null;
  }
}
