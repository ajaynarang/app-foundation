/** Long pasted inputs shouldn't become a 500-term OR. */
const MAX_TERMS = 32;

/**
 * Turns a user question into an any-term tsquery string ("rate | confirmation
 * | upload"). plainto/websearch_to_tsquery AND every word, so a conversational
 * question ("how much does it cost for 12 seats?") would match nothing;
 * ts_rank_cd still rewards chunks that match more of the terms.
 *
 * Only letter/digit runs survive (":", "&", "!" and quotes are dropped).
 * KnowledgeBaseService stems these once with to_tsvector, drops terms common
 * to most chunks, and casts the quoted lexemes to a tsquery.
 * Returns null when nothing searchable is left.
 */
export function toAnyTermQuery(query: string): string | null {
  const terms = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])].slice(0, MAX_TERMS);
  return terms.length > 0 ? terms.join(' | ') : null;
}
