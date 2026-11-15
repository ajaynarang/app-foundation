import { scoreQuestion, summarise } from '../eval/kb-eval';

const q = { q: 'What is the platform?', caller: 'MEMBER', expect: ['a.md', 'b.md'] };

describe('kb eval scoring', () => {
  it('ranks the first expected source', () => {
    expect(scoreQuestion(q, ['x.md', 'b.md', 'a.md']).rank).toBe(2);
    expect(scoreQuestion(q, ['x.md', null]).rank).toBeNull();
  });

  it('computes recall@k and MRR, listing misses', () => {
    const report = summarise(
      [scoreQuestion(q, ['a.md']), scoreQuestion(q, ['x.md', 'a.md']), scoreQuestion(q, ['x.md'])],
      5,
    );
    expect(report.recallAtK).toBeCloseTo(0.667, 3);
    expect(report.mrr).toBeCloseTo(0.5, 3);
    expect(report.misses).toHaveLength(1);
  });

  it('treats a hit below k as a miss', () => {
    const report = summarise([scoreQuestion(q, ['x', 'x', 'a.md'])], 2);
    expect(report.recallAtK).toBe(0);
    expect(report.mrr).toBe(0);
  });
});
