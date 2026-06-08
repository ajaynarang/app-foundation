/**
 * Shared helpers for binary response assertions used by PDF / ZIP exports.
 *
 * File is intentionally under `_shared/` with a leading underscore so
 * Playwright's default spec collector ignores it — nothing here is a test.
 *
 * `extractBinaryLength` was previously inlined as `(await res.body()).length`
 * in individual specs (e.g. `tests/api/financials/invoices-pdf-share.spec.ts`).
 * Phase 3 promotes the pattern so Shield's PDF export + every future
 * binary-response test can share the same entry point.
 */
import type { APIResponse } from '@playwright/test';

/**
 * Read the full body of a Playwright `APIResponse` and return its byte
 * length. Used for envelope assertions on PDF / ZIP responses where we
 * don't want to parse the file contents.
 *
 * The response stream is consumed — callers can only call this ONCE per
 * response. If the body is already consumed (e.g. `res.text()` was called
 * earlier), Playwright throws.
 */
export async function extractBinaryLength(res: APIResponse): Promise<number> {
  const body = await res.body();
  return body.length;
}

/**
 * Assert that a binary response body starts with a known magic prefix.
 *
 * Example: `%PDF-` for PDFs, `PK\x03\x04` for ZIPs. Returns the buffer
 * so callers can do further assertions without re-reading the stream.
 */
export async function extractBinaryWithMagic(res: APIResponse, magic: string): Promise<Buffer> {
  const body = await res.body();
  const actual = body.subarray(0, magic.length).toString('utf-8');
  if (actual !== magic) {
    throw new Error(`binary magic mismatch: expected "${magic}", got "${actual}" (body length ${body.length})`);
  }
  return body;
}
