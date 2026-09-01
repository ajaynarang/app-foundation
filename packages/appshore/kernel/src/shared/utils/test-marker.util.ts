import { BadRequestException } from '@nestjs/common';

/**
 * Dev/QA junk that must never reach a demo-facing feed (E57-5). Multiword entries match
 * as substrings anywhere; single words match only when they are the ENTIRE trimmed value,
 * so a real sentence ("COVID test at gate", "Say hello to…") is never a false positive.
 *
 * The seed-lint at packages/appshore/db/scripts/__tests__/seed-no-test-markers.spec.ts keeps
 * a COPY of this list — @appshore/db does not depend on kernel. Update both together.
 */
export const TEST_MARKERS = {
  substrings: ['delete me', 'sse live test'] as const,
  loneWords: ['test', 'asdf', 'hello'] as const,
};

/** True when `text` is (or, for multiword markers, contains) a dev/QA test placeholder. */
export function isTestMarker(text: string | null | undefined): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  if (TEST_MARKERS.substrings.some((marker) => lower.includes(marker))) return true;
  const trimmed = lower.trim();
  return TEST_MARKERS.loneWords.includes(trimmed as (typeof TEST_MARKERS.loneWords)[number]);
}

/** Throw if `text` is a test marker. Use at USER/SEED-authored create boundaries. */
export function assertNoTestMarker(text: string, field = 'text'): void {
  if (isTestMarker(text)) {
    throw new BadRequestException(`This ${field} looks like a test placeholder — give it a real value.`);
  }
}
