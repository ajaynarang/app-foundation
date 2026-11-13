/**
 * How many tokens a model call may write, by the shape of its answer. Every structured call and every chat stream names
 * one: left unset, some routes ask the provider for the model's whole output window, and a key with a tight credit
 * limit (a capped workspace sub-key, a tenant's own key) refuses that call outright, so the feature produces nothing.
 * A caller picks the size its answer needs and names it next to the call (`CLASSIFIER_MAX_OUTPUT_TOKENS = …`).
 *
 * Thinking is always on for the Claude 5.5 models and is billed as output, so it spends this ceiling too. A 50-token
 * classifier cap was observed spent entirely on thinking, leaving no answer. No ceiling is therefore below 1,024.
 */
export const MIN_OUTPUT_CEILING = 1_024;

export const OUTPUT_CEILINGS = {
  /** A word or a label (plus the thinking before it). */
  WORD: MIN_OUTPUT_CEILING,
  /** A verdict with a short note: a classification, a grade, one rule's check. */
  VERDICT: MIN_OUTPUT_CEILING,
  /** A short summary or a handful of items: a brief, a memory note, a list of results. */
  SUMMARY: 2_000,
  /** A longer list: findings across a diff, candidates from a chunk, rewrites of several sentences. */
  LIST: 4_000,
  /** One agent step: tool calls and notes, or one chat answer. */
  STEP: 8_000,
  /** A whole document or a document-wide set of edits. */
  DOCUMENT: 16_000,
} as const;
