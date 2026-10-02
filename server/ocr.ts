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

/**
 * Ceiling on the decoded size of a statement photo.
 *
 * `MAX_UPLOAD_BYTES` allows 25 MB, which is a sane limit for a request and an
 * unreasonable one for OCR. Tesseract works on decoded pixel data, so a large
 * photo is tens of megabytes of bitmap decoded, scaled, and recognised — long
 * enough to hold the event loop while a single user waits. Two uploads at once
 * made it worse, which is why the upload route caps concurrency as well.
 *
 * 12 MB decoded is far above a photographed statement and far below anything that
 * stalls the worker. Refused with an explanation rather than silently resized,
 * because a resized photo loses exactly the small figures this app exists to read.
 */
export const MAX_OCR_IMAGE_BYTES = 12 * 1024 * 1024;

let worker: Worker | null = null;

/**
 * The in-flight worker creation, memoised.
 *
 * The previous version was `if (worker) return worker; worker = await
 * createWorker('eng')`. Two uploads arriving together both saw `worker === null`
 * and both called `createWorker`, because the `await` yields between the check and
 * the assignment. The second worker was never assigned, never terminated, and held
 * its own copy of the language data for the life of the process — so the first
 * concurrent uploads permanently doubled the memory this module uses.
 *
 * Memoising the promise closes the window: the second caller awaits the same
 * creation rather than starting a second one.
 */
let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (worker) return worker;
  if (!workerPromise) {
    workerPromise = createWorker('eng').then((created) => {
      worker = created;
      return created;
    });
  }
  try {
    return await workerPromise;
  } catch (err) {
    // A failed creation must not be cached, or one transient failure leaves the
    // process permanently unable to read any image.
    workerPromise = null;
    throw err;
  }
}

/** Reads text out of a base64-encoded statement photo. */
export async function ocrImageBase64(base64: string): Promise<string> {
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length > MAX_OCR_IMAGE_BYTES) {
    throw new Error(
      `That photo is about ${(buffer.length / 1024 / 1024).toFixed(1)} MB once decoded, past ` +
        `the ${(MAX_OCR_IMAGE_BYTES / 1024 / 1024).toFixed(0)} MB limit for reading a statement. ` +
        'Crop it to the statement and try again.',
    );
  }
  const w = await getWorker();
  const { data } = await w.recognize(buffer);
  return data.text ?? '';
}

export async function closeOcrWorker(): Promise<void> {
  // Cleared as well as terminated. `closeOcrWorker` is called on shutdown and in
  // tests; leaving the memoised promise meant a worker created afterwards was
  // never assigned, so the module handed out a terminated worker instead of a
  // live one.
  workerPromise = null;
  if (worker) {
    await worker.terminate();
    worker = null;
  }
}
