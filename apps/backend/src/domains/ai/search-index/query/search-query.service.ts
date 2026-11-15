import { Injectable, Logger } from '@nestjs/common';
import { AiSurface } from '@appshore/db';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { EmbeddingService } from '../../infrastructure/providers/embedding.service';
import { fuseRankings, type FusionCandidate } from '../../knowledge-base/retrieval/rank-fusion';
import { toAnyTermQuery } from '../../knowledge-base/retrieval/text-query';
import { CANDIDATES_PER_LIST, DEFAULT_RETRIEVE_LIMIT, MAX_CHUNKS_PER_RECORD, MAX_RETRIEVE_LIMIT } from '../constants';
import { SUBJECT_TYPE_PATTERN } from '../search-subject';

export interface RetrieveOptions {
  /** Only these subject types; every registered type when empty or absent. */
  types?: readonly string[];
  /** How many chunks to return (default 5, at most 25). */
  limit?: number;
  /** Chunks of one record in the result (default 2). 1 gives one hit per record. */
  maxPerRecord?: number;
  /** The person asking, for the AI ledger row of the query's embedding. */
  userId?: number;
}

export interface SearchHit {
  subjectType: string;
  subjectId: string;
  title: string;
  href: string | null;
  section: string | null;
  /** The chunk's text, with its "Title › Section" header. */
  content: string;
  /** Fused rank score, 0 to 1: 1 is first in both the vector and the full-text list. */
  score: number;
}

interface CandidateRow {
  id: number;
  subject_type: string;
  subject_id: string;
  title: string;
  href: string | null;
  section: string | null;
  content: string;
  vector_rank: bigint | number | null;
  vector_similarity: number | string | null;
  text_rank: bigint | number | null;
}

type Candidate = FusionCandidate & { row: CandidateRow };

const toNumber = (value: bigint | number | null): number | null => (value === null ? null : Number(value));
const EMPTY_VECTOR_LIST =
  'SELECT NULL::int AS id, NULL::float8 AS vector_similarity, NULL::bigint AS vector_rank WHERE false';
const EMPTY_TEXT_LIST = 'SELECT NULL::int AS id, NULL::bigint AS text_rank WHERE false';

/**
 * The one way to read the search index: `retrieve` answers a question with the tenant's most relevant chunks.
 * Workflows call it directly; the assistant reaches it through the `search-records` tool.
 *
 * Two ranked lists, vector (pgvector cosine) and full-text (any-term match), fused by Reciprocal Rank Fusion. It
 * never fails because of AI routing: when the query cannot be embedded (no route, a zero-retention tenant, a
 * provider refusal) the full-text list answers alone. Every query is scoped to the tenant it is given.
 */
@Injectable()
export class SearchQueryService {
  private readonly logger = new Logger(SearchQueryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingService,
  ) {}

  async retrieve(tenantId: number, query: string, options: RetrieveOptions = {}): Promise<SearchHit[]> {
    const text = query.trim();
    if (!text) return [];
    const limit = Math.min(Math.max(options.limit ?? DEFAULT_RETRIEVE_LIMIT, 1), MAX_RETRIEVE_LIMIT);
    const types = (options.types ?? []).filter((t) => SUBJECT_TYPE_PATTERN.test(t));
    if (options.types?.length && types.length === 0) return [];

    const embedding = await this.embedQuery(tenantId, text, options.userId);
    const rows = await this.fetchCandidates(tenantId, text, embedding, types);
    const candidates: Candidate[] = rows.map((row) => ({
      row,
      documentId: String(row.id),
      sourceKey: `${row.subject_type}:${row.subject_id}`,
      vectorRank: toNumber(row.vector_rank),
      vectorSimilarity: row.vector_similarity === null ? null : Number(row.vector_similarity),
      textRank: toNumber(row.text_rank),
    }));

    return fuseRankings(candidates, { limit, maxPerSource: options.maxPerRecord ?? MAX_CHUNKS_PER_RECORD }).map(
      ({ candidate, score }) => ({
        subjectType: candidate.row.subject_type,
        subjectId: candidate.row.subject_id,
        title: candidate.row.title,
        href: candidate.row.href,
        section: candidate.row.section,
        content: candidate.row.content,
        score: Math.round(score * 1000) / 1000,
      }),
    );
  }

  /** The query's vector, or null when it cannot be embedded (the reason is logged). */
  private async embedQuery(tenantId: number, query: string, userId?: number): Promise<number[] | null> {
    try {
      return await this.embeddings.embedText(query, { tenantId, userId, surface: AiSurface.EMBEDDING }, 'query');
    } catch (err) {
      const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      this.logger.warn(`Search query not embedded for tenant ${tenantId}; answering from full-text (${reason})`);
      return null;
    }
  }

  /** Both ranked lists in one round trip. Every value is a positional parameter, never interpolated. */
  private async fetchCandidates(
    tenantId: number,
    query: string,
    embedding: number[] | null,
    types: readonly string[],
  ): Promise<CandidateRow[]> {
    const params: unknown[] = [];
    const param = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };
    const filters = [`tenant_id = ${param(tenantId)}`];
    if (types.length) filters.push(`subject_type = ANY(${param([...types])}::text[])`);
    const where = filters.join(' AND ');
    const candidateLimit = param(CANDIDATES_PER_LIST);

    const vectorList = embedding
      ? `SELECT id, vector_similarity, ROW_NUMBER() OVER (ORDER BY distance) AS vector_rank
           FROM (SELECT id,
                        embedding <=> ${param(`[${embedding.join(',')}]`)}::vector AS distance,
                        1 - (embedding <=> ${`$${params.length}`}::vector) AS vector_similarity
                   FROM search_chunks
                  WHERE ${where} AND embedding IS NOT NULL
                  ORDER BY distance
                  LIMIT ${candidateLimit}) nearest`
      : null;
    const terms = toAnyTermQuery(query);
    // The terms are stemmed once and quoted, then cast to a tsquery: they can never be a syntax error.
    const textList = terms
      ? `SELECT id, ROW_NUMBER() OVER (ORDER BY score DESC) AS text_rank
           FROM (SELECT c.id, ts_rank_cd(c.content_tsv, q.tsq) AS score
                   FROM search_chunks c,
                        (SELECT COALESCE(string_agg(quote_literal(l.lexeme), ' | '), '')::tsquery AS tsq
                           FROM unnest(tsvector_to_array(to_tsvector('english', ${param(terms)}))) AS l(lexeme)) q
                  WHERE ${where.replace(/\b(tenant_id|subject_type)\b/g, 'c.$1')} AND c.content_tsv @@ q.tsq
                  ORDER BY score DESC
                  LIMIT ${candidateLimit}) matched`
      : null;

    const sql = `
      WITH vec AS (${vectorList ?? EMPTY_VECTOR_LIST}),
      fts AS (${textList ?? EMPTY_TEXT_LIST})
      SELECT f.id, f.subject_type, f.subject_id, f.title, f.href, f.section, f.content,
             vec.vector_rank, vec.vector_similarity, fts.text_rank
        FROM search_chunks f
        LEFT JOIN vec ON vec.id = f.id
        LEFT JOIN fts ON fts.id = f.id
       WHERE f.tenant_id = ${param(tenantId)} AND (vec.id IS NOT NULL OR fts.id IS NOT NULL)
    `;
    return this.prisma.$queryRawUnsafe<CandidateRow[]>(sql, ...params);
  }
}
