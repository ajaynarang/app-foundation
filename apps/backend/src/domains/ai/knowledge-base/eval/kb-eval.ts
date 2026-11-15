/**
 * Scoring for the knowledge-base golden set. Pure functions so the metric
 * itself is unit-tested; kb-eval.command.ts runs it against a live database.
 */
export interface GoldenQuestion {
  q: string;
  /**
   * Who is asking: a workspace role such as `MEMBER` or `ADMIN`. The searched audiences come from
   * `kbAudiencesFor(caller)`, the same server-side rule the tools apply.
   */
  caller: string;
  /**
   * Content files (relative to the content root, e.g. `knowledge-base/getting-started/welcome.md`); any one answers
   * the question. Labelled by a person reading the content, never by the tool under test.
   */
  expect: string[];
}

export interface QuestionScore {
  q: string;
  /** 1-based rank of the first expected file in the results; null when absent. */
  rank: number | null;
  got: (string | null)[];
}

export interface EvalReport {
  k: number;
  recallAtK: number;
  mrr: number;
  misses: QuestionScore[];
}

export function scoreQuestion(question: GoldenQuestion, retrievedSources: (string | null)[]): QuestionScore {
  const index = retrievedSources.findIndex((s) => s !== null && question.expect.includes(s));
  return { q: question.q, rank: index === -1 ? null : index + 1, got: retrievedSources };
}

export function summarise(scores: QuestionScore[], k: number): EvalReport {
  const n = scores.length || 1;
  const inTopK = (s: QuestionScore) => s.rank !== null && s.rank <= k;
  const mrr = scores.reduce((sum, s) => sum + (inTopK(s) ? 1 / s.rank : 0), 0) / n;
  return {
    k,
    recallAtK: Math.round((scores.filter(inTopK).length / n) * 1000) / 1000,
    mrr: Math.round(mrr * 1000) / 1000,
    misses: scores.filter((s) => !inTopK(s)),
  };
}
