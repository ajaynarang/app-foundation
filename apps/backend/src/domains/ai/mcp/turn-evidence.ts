import { CitationSchema, MAX_CITATIONS_PER_MESSAGE, type Citation, type ReadingFrame } from '@app/shared-types';

/**
 * The key a tool puts on its result to offer citation candidates. `McpToolService` moves it into the turn's evidence
 * and strips it, so the model never sees it: citations come from what was read, not from what the model repeats.
 */
export const CITATIONS_SIDE_CHANNEL = '_citations';

/** Reading frames narrated per tool result: the line names what is being read, it is not a list. */
export const READING_PER_OFFER = 3;

/**
 * What one chat turn read. Tools offer candidates; only those the answer names become citations, so a retrieved but
 * unused hit is not shown as a source. Each new candidate is also narrated once as a transient reading frame.
 */
export class TurnEvidence {
  private readonly candidates = new Map<string, Citation>();
  private readingQueue: ReadingFrame[] = [];
  private wake: (() => void) | null = null;

  /** Offer candidates from a tool result. Malformed entries are dropped; a candidate seen before is not re-narrated. */
  offer(offered: readonly unknown[]): void {
    const fresh: Citation[] = [];
    for (const raw of offered) {
      const parsed = CitationSchema.safeParse(raw);
      if (!parsed.success) continue;
      const key = keyOf(parsed.data);
      if (this.candidates.has(key)) continue;
      this.candidates.set(key, parsed.data);
      fresh.push(parsed.data);
    }

    const frames = fresh.slice(0, READING_PER_OFFER).map((c) => ({ title: c.title }));
    if (frames.length === 0) return;
    this.readingQueue.push(...frames);
    this.wake?.();
    this.wake = null;
  }

  /** The reading frames queued since the last drain. */
  drainReading(): ReadingFrame[] {
    const frames = this.readingQueue;
    this.readingQueue = [];
    return frames;
  }

  /** Resolves when a reading frame is queued (at once if one already is). */
  waitForReading(): Promise<void> {
    if (this.readingQueue.length > 0) return Promise.resolve();
    return new Promise((resolve) => {
      this.wake = resolve;
    });
  }

  /** The candidates the answer names, in the order it first names them, at most `MAX_CITATIONS_PER_MESSAGE`. */
  citedIn(answer: string): Citation[] {
    const mentioned: { citation: Citation; at: number }[] = [];
    for (const citation of this.candidates.values()) {
      const at = firstMention(answer, citation.title);
      if (at >= 0) mentioned.push({ citation, at });
    }
    return mentioned
      .sort((a, b) => a.at - b.at)
      .slice(0, MAX_CITATIONS_PER_MESSAGE)
      .map((m) => m.citation);
  }
}

function keyOf(c: Citation): string {
  return `${c.sourceType}:${c.sourceId}`;
}

/**
 * Where the answer first names a title: word-bounded and case-insensitive. Only a title of two or more words is
 * matched; a one-word title ("Billing") is ordinary prose and would cite a source the answer never used.
 */
function firstMention(answer: string, title: string): number {
  const needle = title.trim();
  if (!/\s/.test(needle)) return -1;
  const match = new RegExp(`(?<![\\w-])${escapeRegExp(needle)}(?![\\w-])`, 'i').exec(answer);
  return match ? match.index : -1;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
