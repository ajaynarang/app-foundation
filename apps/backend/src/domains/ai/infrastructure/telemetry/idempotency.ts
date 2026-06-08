import { createHash } from 'node:crypto';
import type { AiCallContext } from '@app/shared-types';

/**
 * Build a stable idempotency key for an AI invocation so retries of the SAME
 * logical call collapse to one ledger row (no double-billing).
 *
 * Shape: `${surface}:${linkRefType}:${linkRefId}:${attemptKind}:${attemptHash}`
 *
 *   - surface / linkRefType / linkRefId — from the call context; identifies
 *     WHICH entity this call is for (e.g. DOC_RATECON:document:doc_abc).
 *   - attemptKind — 'primary' | 'fallback'. A primary and its fallback are
 *     legitimately distinct calls (different models) and must NOT collapse —
 *     so the kind is part of the key.
 *   - attemptHash — 8-char SHA-256 of the normalized inputs (model alias +
 *     prompt/content digest). A transient retry of the SAME logical attempt
 *     produces the same hash → same key → ON CONFLICT DO NOTHING in the
 *     ledger (no double-billing).
 *
 * IMPORTANT — retry vs reprocess: the content digest alone is NOT enough to
 * tell "BullMQ re-ran the same failed job" (must dedupe) apart from "the user
 * deliberately reprocessed the same document" (a real second API call that
 * must be billed). Callers MUST fold a per-attempt discriminator that is
 * stable across retries but distinct across reprocesses into
 * `contentDigestInput` — e.g. the ratecon parser mixes in the document
 * `jobId` (same across retries of a job, new for each reprocess). Hashing
 * only the content would let an intentional reprocess collapse onto the prior
 * row and silently under-report cost.
 *
 * Missing linkRef parts collapse to 'na' so the key is always well-formed.
 */
export type AttemptKind = 'primary' | 'fallback';

export function buildIdempotencyKey(
  context: Pick<AiCallContext, 'surface' | 'linkRefType' | 'linkRefId'>,
  attemptKind: AttemptKind,
  contentDigestInput: string,
): string {
  const surface = context.surface;
  const linkRefType = context.linkRefType ?? 'na';
  const linkRefId = context.linkRefId ?? 'na';
  const attemptHash = shortHash(`${surface}|${attemptKind}|${contentDigestInput}`);
  return `${surface}:${linkRefType}:${linkRefId}:${attemptKind}:${attemptHash}`;
}

/** First 8 hex chars of a SHA-256 — enough to disambiguate inputs, short
 * enough to keep keys readable and well under the 200-char column cap. */
function shortHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 8);
}
