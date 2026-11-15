/** A record longer than this many chunks is indexed up to the cap; the rest is not searchable. */
export const MAX_CHUNKS_PER_SUBJECT = 50;
/** Texts sent to the embedding provider in one call. */
export const EMBED_BATCH_SIZE = 48;
/** Candidates each ranked list (vector, full-text) contributes before fusion. */
export const CANDIDATES_PER_LIST = 40;
/** Chunks of one record in a result: one record cannot fill every slot. */
export const MAX_CHUNKS_PER_RECORD = 2;
export const DEFAULT_RETRIEVE_LIMIT = 5;
export const MAX_RETRIEVE_LIMIT = 25;
export const SNIPPET_LENGTH = 240;
