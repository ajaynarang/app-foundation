import { buildIdempotencyKey } from '../idempotency';

const ctx = { surface: 'DOC_RATECON' as const, linkRefType: 'document', linkRefId: 'doc-1' };

describe('buildIdempotencyKey', () => {
  it('produces a stable key for identical inputs (retry collapse)', () => {
    const a = buildIdempotencyKey(ctx, 'primary', 'same-content');
    const b = buildIdempotencyKey(ctx, 'primary', 'same-content');
    expect(a).toBe(b);
  });

  it('produces different keys for primary vs fallback (distinct calls)', () => {
    const primary = buildIdempotencyKey(ctx, 'primary', 'content');
    const fallback = buildIdempotencyKey(ctx, 'fallback', 'content');
    expect(primary).not.toBe(fallback);
    expect(primary).toContain(':primary:');
    expect(fallback).toContain(':fallback:');
  });

  it('produces different keys when content differs (re-parse of edited doc)', () => {
    const a = buildIdempotencyKey(ctx, 'primary', 'content-v1');
    const b = buildIdempotencyKey(ctx, 'primary', 'content-v2');
    expect(a).not.toBe(b);
  });

  it('bills a reprocess of IDENTICAL content as a new key when the attempt discriminator changes', () => {
    // The ratecon parser folds the document jobId into contentDigestInput so a
    // user-initiated reprocess (new job) does NOT collapse onto the prior cost.
    // Same PDF bytes, different attempt → distinct keys → both billed.
    const pdfBytes = 'identical-pdf-content';
    const firstRun = buildIdempotencyKey(ctx, 'primary', `job-100|${pdfBytes}`);
    const reprocess = buildIdempotencyKey(ctx, 'primary', `job-101|${pdfBytes}`);
    expect(firstRun).not.toBe(reprocess);
  });

  it('still collapses a BullMQ retry of the SAME job (same attempt + same content)', () => {
    const pdfBytes = 'identical-pdf-content';
    const attempt1 = buildIdempotencyKey(ctx, 'primary', `job-100|${pdfBytes}`);
    const attempt2 = buildIdempotencyKey(ctx, 'primary', `job-100|${pdfBytes}`);
    expect(attempt1).toBe(attempt2);
  });

  it('produces different keys for different entities (linkRefId)', () => {
    const a = buildIdempotencyKey({ ...ctx, linkRefId: 'doc-1' }, 'primary', 'c');
    const b = buildIdempotencyKey({ ...ctx, linkRefId: 'doc-2' }, 'primary', 'c');
    expect(a).not.toBe(b);
  });

  it('follows the documented shape surface:linkRefType:linkRefId:kind:hash', () => {
    const key = buildIdempotencyKey(ctx, 'primary', 'c');
    const parts = key.split(':');
    expect(parts[0]).toBe('DOC_RATECON');
    expect(parts[1]).toBe('document');
    expect(parts[2]).toBe('doc-1');
    expect(parts[3]).toBe('primary');
    expect(parts[4]).toMatch(/^[0-9a-f]{8}$/); // 8-char hex hash
  });

  it('collapses missing linkRef parts to "na" so the key stays well-formed', () => {
    const key = buildIdempotencyKey({ surface: 'SALLY_CHAT' as const }, 'primary', 'c');
    const parts = key.split(':');
    expect(parts[0]).toBe('SALLY_CHAT');
    expect(parts[1]).toBe('na');
    expect(parts[2]).toBe('na');
  });

  it('stays well under the 200-char column cap', () => {
    const key = buildIdempotencyKey(ctx, 'fallback', 'x'.repeat(100000));
    expect(key.length).toBeLessThan(200);
  });
});
