/**
 * Reciprocal Rank Fusion for hybrid (vector + full-text) retrieval.
 *
 * Cosine similarity and ts_rank live on different scales, so adding them
 * (the old 0.7/0.3 blend) lets whichever scale is larger dominate. RRF uses
 * only each candidate's rank in each list: score = Σ 1 / (k + rank). A chunk
 * that ranks well in either list surfaces; one that ranks well in both wins.
 */
export const RRF_K = 60;

/** A chunk whose only signal is a weak vector match is noise, not an answer. */
export const MIN_VECTOR_ONLY_SIMILARITY = 0.2;

export interface FusionCandidate {
  documentId: string;
  /** Groups chunks of one source doc, so one page can't fill every slot. */
  sourceKey: string;
  /** 1-based rank in the vector list; null when absent from it. */
  vectorRank: number | null;
  vectorSimilarity: number | null;
  /** 1-based rank in the full-text list; null when absent from it. */
  textRank: number | null;
}

export interface FusedCandidate<T extends FusionCandidate> {
  candidate: T;
  /** RRF score normalised to 0–1 against a candidate ranked first in both lists. */
  score: number;
}

export interface FuseOptions {
  limit: number;
  maxPerSource: number;
  k?: number;
  minVectorOnlySimilarity?: number;
}

export function fuseRankings<T extends FusionCandidate>(candidates: T[], options: FuseOptions): FusedCandidate<T>[] {
  const k = options.k ?? RRF_K;
  const floor = options.minVectorOnlySimilarity ?? MIN_VECTOR_ONLY_SIMILARITY;
  const best = 2 / (k + 1);

  const scored = candidates
    .filter((c) => c.vectorRank !== null || c.textRank !== null)
    .filter((c) => c.textRank !== null || (c.vectorSimilarity ?? 0) >= floor)
    .map((c) => {
      const raw = (c.vectorRank ? 1 / (k + c.vectorRank) : 0) + (c.textRank ? 1 / (k + c.textRank) : 0);
      return { candidate: c, score: raw / best };
    })
    .sort((a, b) => b.score - a.score || a.candidate.documentId.localeCompare(b.candidate.documentId));

  const perSource = new Map<string, number>();
  const out: FusedCandidate<T>[] = [];
  for (const item of scored) {
    const used = perSource.get(item.candidate.sourceKey) ?? 0;
    if (used >= options.maxPerSource) continue;
    perSource.set(item.candidate.sourceKey, used + 1);
    out.push(item);
    if (out.length >= options.limit) break;
  }
  return out;
}
