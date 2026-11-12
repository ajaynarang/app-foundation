import { Injectable, Logger } from '@nestjs/common';
import type { AiCallContext } from '@app/shared-types';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { EmbeddingService } from '../infrastructure/providers/embedding.service';
import { fuseRankings, type FusionCandidate } from './retrieval/rank-fusion';
import { toAnyTermQuery } from './retrieval/text-query';

export interface SearchOptions {
  /**
   * Exactly the audiences to search, no implicit `all`. Decide them with `kbAudiencesFor` (kb-audience.ts); never
   * pass a model-chosen value.
   */
  audiences: string[];
  /**
   * The tenant the query is embedded for (its route, its retention policy, its bill). Without one, and without
   * `platformQuery`, there is no route to embed by and the search is full-text alone.
   */
  aiContext?: AiCallContext;
  /**
   * Embed the query on the platform route with no tenant and no ledger row. Only for an operator tool searching the
   * global corpus (`pnpm kb:eval`); a caller acting for a workspace passes `aiContext`.
   */
  platformQuery?: boolean;
  documentType?: string;
  category?: string;
  limit?: number;
}

export interface SearchResult {
  documentId: string;
  /** The document a chunk belongs to (null for a single-chunk document): what a citation names. */
  parentDocId: string | null;
  title: string;
  /** The heading path the chunk sits under, e.g. "Inviting teammates › Roles". */
  section: string | null;
  /** The content file it came from; null for a row a product inserted by other means. */
  sourcePath: string | null;
  content: string;
  documentType: string;
  audience: string;
  category: string;
  keywords: string[];
  /** Fused relevance, 0 to 1. */
  similarity: number;
}

/** Candidates pulled from each list before fusion. */
const CANDIDATES_PER_LIST = 30;
/** One file should not fill every slot; two chunks keeps adjacent context. */
const MAX_CHUNKS_PER_SOURCE = 2;
/**
 * A query term in more than this share of chunks carries no signal (Postgres ranking has no IDF). 0.25 to 0.3 is
 * where a 50-question golden set peaked on a corpus of a few hundred files; re-tune with `pnpm kb:eval`.
 */
const MAX_TERM_DOC_SHARE = 0.3;
/**
 * A term in at most this many chunks is always kept. On a small corpus (the starter ships a handful of files) the
 * share rule alone would drop nearly every term, and full-text, the search that needs no provider, would find nothing.
 */
const MIN_KEPT_TERM_DOCS = 3;
/** Whole-topic fetches return sections, not the full corpus. */
const MAX_CATEGORY_CHUNKS = 40;

interface CandidateRow {
  document_id: string;
  parent_doc_id: string | null;
  title: string;
  section: string | null;
  source_path: string | null;
  content: string;
  document_type: string;
  audience: string;
  category: string;
  keywords: string[] | null;
  vector_rank: bigint | number | null;
  vector_similarity: number | null;
  text_rank: bigint | number | null;
}

type Candidate = FusionCandidate & { row: CandidateRow };

const EMPTY_VECTOR_LIST =
  'SELECT NULL::varchar AS document_id, NULL::float AS vector_similarity, NULL::bigint AS vector_rank WHERE false';
const EMPTY_TEXT_LIST = 'SELECT NULL::varchar AS document_id, NULL::bigint AS text_rank WHERE false';

const toNumber = (v: bigint | number | null): number | null => (v === null ? null : Number(v));

/** An empty set would match nothing in SQL; treat it as a caller bug, not "search everything". */
function assertAudiences(audiences: string[]): void {
  if (!Array.isArray(audiences) || audiences.length === 0) {
    throw new Error('Knowledge-base search needs at least one audience (see kbAudiencesFor)');
  }
}

@Injectable()
export class KnowledgeBaseService {
  private readonly logger = new Logger(KnowledgeBaseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  /**
   * Hybrid search: a vector list (pgvector cosine) and a full-text list (tsvector, any-term match) fused by
   * Reciprocal Rank Fusion, at most two chunks per source file.
   *
   * Search never fails because of routing. When the query cannot be embedded (no embedding route, a zero-retention
   * tenant with no zero-retention route, a failing key, a credit refusal, a provider error, no tenant) the vector
   * list is empty and the full-text list answers alone; it sends nothing to a provider. Chunks with no vector yet
   * (vectors cleared and not re-embedded) are found the same way.
   */
  async hybridSearch(query: string, options: SearchOptions): Promise<SearchResult[]> {
    assertAudiences(options.audiences);
    const limit = options.limit ?? 5;

    const embedding = await this.embedQuery(query, options);
    const rows = await this.fetchCandidates(query, embedding, options);
    const candidates: Candidate[] = rows.map((row) => ({
      row,
      documentId: row.document_id,
      // A product's own row (null path) is grouped by its document, so the two-chunk cap still holds for it.
      sourceKey: row.source_path ?? row.parent_doc_id ?? row.document_id,
      vectorRank: toNumber(row.vector_rank),
      vectorSimilarity: row.vector_similarity === null ? null : Number(row.vector_similarity),
      textRank: toNumber(row.text_rank),
    }));

    return fuseRankings(candidates, { limit, maxPerSource: MAX_CHUNKS_PER_SOURCE }).map(({ candidate, score }) => ({
      documentId: candidate.row.document_id,
      parentDocId: candidate.row.parent_doc_id ?? null,
      title: candidate.row.title,
      section: candidate.row.section,
      sourcePath: candidate.row.source_path,
      content: candidate.row.content,
      documentType: candidate.row.document_type,
      audience: candidate.row.audience,
      category: candidate.row.category,
      keywords: candidate.row.keywords ?? [],
      similarity: Math.round(score * 1000) / 1000,
    }));
  }

  /** The query's vector, or null when it cannot be embedded (the reason is logged). */
  private async embedQuery(query: string, options: SearchOptions): Promise<number[] | null> {
    try {
      if (options.platformQuery) return (await this.embeddingService.embedForPlatform([query], 'query'))[0];
      if (!options.aiContext) return null;
      return await this.embeddingService.embedText(query, options.aiContext, 'query');
    } catch (err) {
      const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      this.logger.warn(`Knowledge-base query not embedded; answering from full-text (${reason})`);
      return null;
    }
  }

  /**
   * Both ranked lists in one round trip. Each list orders and limits inside a subquery so Postgres can use the vector
   * and GIN indexes, then numbers its rows for fusion. Every value is a positional parameter, never interpolated.
   */
  private async fetchCandidates(
    query: string,
    embedding: number[] | null,
    options: SearchOptions,
  ): Promise<CandidateRow[]> {
    const params: unknown[] = [];
    const param = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };

    const filters = [`audience = ANY(${param(options.audiences)}::text[])`];
    if (options.documentType) filters.push(`document_type = ${param(options.documentType)}`);
    if (options.category) filters.push(`category = ${param(options.category)}`);
    const where = filters.join(' AND ');
    const candidateLimit = param(CANDIDATES_PER_LIST);

    const vectorList = embedding ? this.vectorList(where, param(`[${embedding.join(',')}]`), candidateLimit) : null;
    const terms = toAnyTermQuery(query);
    const textList = terms ? this.textList(where, param(terms), candidateLimit) : null;

    const sql = `
      WITH vec AS (${vectorList ?? EMPTY_VECTOR_LIST}),
      fts AS (${textList ?? EMPTY_TEXT_LIST})
      SELECT f.document_id, f.parent_doc_id, f.title, f.section, f.source_path, f.content, f.document_type,
             f.audience, f.category, f.keywords,
             vec.vector_rank, vec.vector_similarity, fts.text_rank
        FROM knowledge_documents f
        LEFT JOIN vec ON vec.document_id = f.document_id
        LEFT JOIN fts ON fts.document_id = f.document_id
       WHERE vec.document_id IS NOT NULL OR fts.document_id IS NOT NULL
    `;

    return this.prisma.$queryRawUnsafe<CandidateRow[]>(sql, ...params);
  }

  private vectorList(where: string, vectorParam: string, limitParam: string): string {
    return `
      SELECT document_id, vector_similarity, ROW_NUMBER() OVER (ORDER BY distance) AS vector_rank
        FROM (SELECT document_id,
                     embedding <=> ${vectorParam}::vector AS distance,
                     1 - (embedding <=> ${vectorParam}::vector) AS vector_similarity
                FROM knowledge_documents
               WHERE ${where} AND embedding IS NOT NULL
               ORDER BY distance
               LIMIT ${limitParam}) nearest`;
  }

  /**
   * Postgres full-text ranking has no IDF, so an any-term query is swamped by words that appear everywhere. Terms
   * found in more than MAX_TERM_DOC_SHARE of chunks (and in more than MIN_KEPT_TERM_DOCS) are dropped; the rare words
   * decide the ranking. Lexemes are quoted and cast straight to tsquery, so they are stemmed once and can never be a
   * syntax error.
   */
  private textList(where: string, termsParam: string, limitParam: string): string {
    return `
      SELECT document_id, ROW_NUMBER() OVER (ORDER BY score DESC) AS text_rank
        FROM (SELECT document_id, ts_rank_cd(content_tsv, q.tsq) AS score
                FROM knowledge_documents,
                     (SELECT COALESCE(string_agg(quote_literal(l.lexeme), ' | '), '')::tsquery AS tsq
                        FROM unnest(tsvector_to_array(to_tsvector('english', ${termsParam}))) AS l(lexeme)
                        JOIN ts_stat('SELECT content_tsv FROM knowledge_documents') st ON st.word = l.lexeme
                       WHERE st.ndoc <= GREATEST(${MAX_TERM_DOC_SHARE} * (SELECT count(*) FROM knowledge_documents),
                                                 ${MIN_KEPT_TERM_DOCS})) q
               WHERE ${where} AND content_tsv @@ q.tsq
               ORDER BY score DESC
               LIMIT ${limitParam}) matched`;
  }

  /** Every chunk of a topic in reading order (structured retrieval, no embedding needed). */
  async getByCategory(category: string, audiences: string[]) {
    assertAudiences(audiences);
    return this.prisma.knowledgeDocument.findMany({
      where: { category, audience: { in: audiences } },
      orderBy: [{ sourcePath: 'asc' }, { chunkIndex: 'asc' }],
      take: MAX_CATEGORY_CHUNKS,
      select: {
        documentId: true,
        parentDocId: true,
        title: true,
        section: true,
        content: true,
        documentType: true,
        category: true,
        keywords: true,
      },
    });
  }
}
