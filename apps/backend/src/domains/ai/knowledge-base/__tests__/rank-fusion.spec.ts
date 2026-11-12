import { fuseRankings, type FusionCandidate } from '../retrieval/rank-fusion';

const c = (
  documentId: string,
  vectorRank: number | null,
  textRank: number | null,
  opts: { sourceKey?: string; vectorSimilarity?: number } = {},
): FusionCandidate => ({
  documentId,
  sourceKey: opts.sourceKey ?? documentId,
  vectorRank,
  vectorSimilarity: opts.vectorSimilarity ?? (vectorRank ? 0.5 : null),
  textRank,
});

describe('fuseRankings', () => {
  it('ranks a candidate found by both lists above one found by either alone', () => {
    const out = fuseRankings([c('vec-only', 1, null), c('both', 2, 2), c('text-only', null, 1)], {
      limit: 5,
      maxPerSource: 2,
    });
    expect(out.map((o) => o.candidate.documentId)).toEqual(['both', 'text-only', 'vec-only']);
  });

  // The old query filtered on vector score, so an exact keyword hit
  // ("SAML", "webhook") with a weak embedding match never surfaced.
  it('keeps a keyword-only hit even with a weak vector match', () => {
    const out = fuseRankings([c('keyword', null, 1)], { limit: 5, maxPerSource: 2 });
    expect(out).toHaveLength(1);
  });

  it('drops a vector-only candidate below the similarity floor', () => {
    const out = fuseRankings(
      [c('noise', 1, null, { vectorSimilarity: 0.1 }), c('ok', 2, null, { vectorSimilarity: 0.4 })],
      {
        limit: 5,
        maxPerSource: 2,
      },
    );
    expect(out.map((o) => o.candidate.documentId)).toEqual(['ok']);
  });

  it('caps chunks per source document', () => {
    const out = fuseRankings(
      [
        c('a1', 1, 1, { sourceKey: 'a.md' }),
        c('a2', 2, 2, { sourceKey: 'a.md' }),
        c('a3', 3, 3, { sourceKey: 'a.md' }),
        c('b1', 4, 4, { sourceKey: 'b.md' }),
      ],
      { limit: 5, maxPerSource: 2 },
    );
    expect(out.map((o) => o.candidate.documentId)).toEqual(['a1', 'a2', 'b1']);
  });

  it('normalises scores to 0–1 with rank-1-in-both as 1', () => {
    const [top] = fuseRankings([c('top', 1, 1)], { limit: 1, maxPerSource: 1 });
    expect(top.score).toBeCloseTo(1);
  });

  it('honours the limit', () => {
    const many = Array.from({ length: 20 }, (_, i) => c(`d${i}`, i + 1, null));
    expect(fuseRankings(many, { limit: 5, maxPerSource: 2 })).toHaveLength(5);
  });
});
