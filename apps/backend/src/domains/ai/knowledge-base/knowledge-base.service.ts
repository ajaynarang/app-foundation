import { Injectable, Logger } from '@nestjs/common';
import type { AiCallContext } from '@app/shared-types';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { EmbeddingService } from '../infrastructure/providers/embedding.service';

export interface SearchOptions {
  audience: string;
  /**
   * The tenant the query is embedded for (its route, its retention policy, its bill). Without one there is no route
   * to embed by, and the search is full-text alone.
   */
  aiContext?: AiCallContext;
  documentType?: string;
  category?: string;
  limit?: number;
  similarityThreshold?: number;
}

export interface SearchResult {
  documentId: string;
  title: string;
  content: string;
  documentType: string;
  audience: string;
  category: string;
  keywords: string[];
  similarity: number;
}

@Injectable()
export class KnowledgeBaseService {
  private readonly logger = new Logger(KnowledgeBaseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  /**
   * Hybrid search: cosine similarity (pgvector) blended with full-text rank (tsvector), scored
   * `0.7 * vector_score + 0.3 * text_score`. The query is embedded on the caller's tenant route as a `query`.
   *
   * Search never fails because of routing. When the query cannot be embedded (no embedding route, a zero-retention
   * tenant with no zero-retention route, a provider error, no tenant) or no stored chunk has a vector yet (vectors
   * cleared and not re-embedded), it answers from full-text alone, which sends nothing to a provider.
   */
  async hybridSearch(query: string, options: SearchOptions): Promise<SearchResult[]> {
    const queryEmbedding = await this.embedQuery(query, options.aiContext);
    if (queryEmbedding) {
      const results = await this.vectorSearch(query, queryEmbedding, options);
      if (results.length > 0) return results;
    }
    return this.textSearch(query, options);
  }

  /** The query's vector, or null when it cannot be embedded (the reason is logged). */
  private async embedQuery(query: string, aiContext: AiCallContext | undefined): Promise<number[] | null> {
    if (!aiContext) return null;
    try {
      return await this.embeddingService.embedText(query, aiContext, 'query');
    } catch (err) {
      const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      this.logger.warn(`Knowledge-base query not embedded; answering from full-text (${reason})`);
      return null;
    }
  }

  /** The filters both queries share, as SQL conditions over positional params starting at `$<first>`. */
  private filters(options: SearchOptions, first: number): { conditions: string[]; params: (string | number)[] } {
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    const next = () => `$${first + params.length}`;

    conditions.push(`(audience = ${next()} OR audience = 'all')`);
    params.push(options.audience);
    if (options.documentType) {
      conditions.push(`document_type = ${next()}`);
      params.push(options.documentType);
    }
    if (options.category) {
      conditions.push(`category = ${next()}`);
      params.push(options.category);
    }
    return { conditions, params };
  }

  private async vectorSearch(query: string, queryEmbedding: number[], options: SearchOptions): Promise<SearchResult[]> {
    const { limit = 5, similarityThreshold = 0.3 } = options;
    // $1: the query vector; then the filters; then the full-text query, the threshold and the limit. Every value is
    // a parameter, never interpolated.
    const { conditions, params } = this.filters(options, 2);
    conditions.push('embedding IS NOT NULL');
    const queryIdx = 2 + params.length;
    const allParams = [`[${queryEmbedding.join(',')}]`, ...params, query, similarityThreshold, limit];

    const sql = `
      WITH vector_search AS (
        SELECT
          document_id,
          title,
          content,
          document_type,
          audience,
          category,
          keywords,
          1 - (embedding <=> $1::vector) AS vector_score,
          ts_rank_cd(content_tsv, plainto_tsquery('english', $${queryIdx})) AS text_score
        FROM knowledge_documents
        WHERE ${conditions.join(' AND ')}
      )
      SELECT
        document_id,
        title,
        content,
        document_type,
        audience,
        category,
        keywords,
        (0.7 * vector_score + 0.3 * LEAST(text_score, 1.0)) AS similarity
      FROM vector_search
      WHERE vector_score >= $${queryIdx + 1}
      ORDER BY similarity DESC
      LIMIT $${queryIdx + 2}
    `;

    return this.toResults(await this.prisma.$queryRawUnsafe<any[]>(sql, ...allParams));
  }

  /** Full-text alone: rows whose text matches the query, by rank. Needs no vector on either side. */
  private async textSearch(query: string, options: SearchOptions): Promise<SearchResult[]> {
    const { limit = 5 } = options;
    // $1: the full-text query; then the filters; then the limit.
    const { conditions, params } = this.filters(options, 2);
    conditions.push(`content_tsv @@ plainto_tsquery('english', $1)`);
    const limitIdx = 2 + params.length;

    const sql = `
      SELECT
        document_id,
        title,
        content,
        document_type,
        audience,
        category,
        keywords,
        LEAST(ts_rank_cd(content_tsv, plainto_tsquery('english', $1)), 1.0) AS similarity
      FROM knowledge_documents
      WHERE ${conditions.join(' AND ')}
      ORDER BY similarity DESC
      LIMIT $${limitIdx}
    `;

    return this.toResults(await this.prisma.$queryRawUnsafe<any[]>(sql, query, ...params, limit));
  }

  private toResults(rows: any[]): SearchResult[] {
    return rows.map((row) => ({
      documentId: row.document_id,
      title: row.title,
      content: row.content,
      documentType: row.document_type,
      audience: row.audience,
      category: row.category,
      keywords: row.keywords ?? [],
      similarity: parseFloat(row.similarity),
    }));
  }

  /**
   * Fetch documents by category (structured retrieval, no embedding needed).
   */
  async getByCategory(category: string, audience: string) {
    return this.prisma.knowledgeDocument.findMany({
      where: {
        category,
        audience: { in: [audience, 'all'] },
      },
      orderBy: { chunkIndex: 'asc' },
      select: {
        documentId: true,
        title: true,
        content: true,
        documentType: true,
        category: true,
        keywords: true,
      },
    });
  }
}
