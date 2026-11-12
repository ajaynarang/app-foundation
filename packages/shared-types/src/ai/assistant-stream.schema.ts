import { z } from 'zod';

/**
 * The assistant's chat stream: one line per frame, a two-character code then its payload. One table, used by the
 * backend that writes the frames and the web that reads them.
 *
 * Deploy order is free: the web and the backend deploy separately, so a reader must skip any frame whose code it does
 * not know. An old reader against a newer backend then shows what it understands and drops the rest.
 */
export const STREAM_FRAME = {
  /** A text delta, JSON-encoded string. */
  TEXT: '0:',
  /** A rich card a tool produced (JSON object). */
  CARD: '8:',
  /** The agent suspended for a confirmation (JSON payload with `runId`). */
  SUSPEND: '9:',
  /** Follow-up suggestions (JSON string array). */
  FOLLOWUPS: 'a:',
  /** A source the answer named ({@link Citation}). Persisted on the message. */
  CITATION: 'c:',
  /** What the assistant is reading right now ({@link ReadingFrame}). Transient, never persisted. */
  READING: 't:',
  /** Terminal: `{ code, detail }`. The turn failed after the stream began; nothing follows it. */
  ERROR: 'x:',
} as const;
export type StreamFrameCode = (typeof STREAM_FRAME)[keyof typeof STREAM_FRAME];

/** Length of every frame code: a reader slices the payload after it. */
export const STREAM_FRAME_CODE_LENGTH = 2;

/**
 * The machine codes of the AI refusals. They are the `code` of the error envelope (before the stream starts) and of
 * the terminal `x:` frame (after). Readers show `detail`; the code is for logs and branching.
 */
export const AI_ERROR_CODE = {
  AI_NOT_CONFIGURED: 'AI_NOT_CONFIGURED',
  AI_CREDENTIAL_FAILING: 'AI_CREDENTIAL_FAILING',
  AI_BUDGET_EXCEEDED: 'AI_BUDGET_EXCEEDED',
  ZERO_RETENTION_UNAVAILABLE: 'ZERO_RETENTION_UNAVAILABLE',
} as const;
export type AiErrorCode = (typeof AI_ERROR_CODE)[keyof typeof AI_ERROR_CODE];

/** The terminal `x:` frame. */
export const StreamErrorFrameSchema = z.object({
  code: z.string(),
  detail: z.string(),
});
export type StreamErrorFrame = z.infer<typeof StreamErrorFrameSchema>;

/** Upper bound on citations sent and stored per assistant message. */
export const MAX_CITATIONS_PER_MESSAGE = 8;

/** The knowledge base's source type: the template emits citations for knowledge-base documents. */
export const CITATION_SOURCE_KNOWLEDGE_DOCUMENT = 'KNOWLEDGE_DOCUMENT';

/**
 * A source the assistant read and named in its answer. Generic: `sourceType` says what kind of record it is (a
 * product adds its own types), `sourceId` is that record's public id, never a numeric one. `href` is an in-app path
 * when the source has a page to open (one leading slash: `//host` and `/\host` are off-site links, so refused); a
 * source without one is shown as plain text.
 */
export const CitationSchema = z.object({
  sourceType: z.string().min(1).max(64),
  sourceId: z.string().min(1).max(120),
  title: z.string().min(1).max(255),
  href: z
    .string()
    .regex(/^\/(?![/\\])/, 'An in-app path starting with a single /')
    .max(500)
    .optional(),
});
export type Citation = z.infer<typeof CitationSchema>;

/** The transient `t:` frame: what is being read, while it is read. */
export const ReadingFrameSchema = z.object({
  title: z.string().min(1).max(255),
});
export type ReadingFrame = z.infer<typeof ReadingFrameSchema>;

/**
 * Each person keeps at most this many active conversations per workspace. Creating one more archives the oldest
 * (`isActive = false`; rows and messages are kept). History lists active conversations only.
 */
export const MAX_ACTIVE_CONVERSATIONS = 30;
