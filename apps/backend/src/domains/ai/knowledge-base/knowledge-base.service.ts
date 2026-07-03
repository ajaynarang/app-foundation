import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { EmbeddingService } from '../infrastructure/providers/embedding.service';

export interface SearchOptions {
  audience: string;
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
   * Hybrid search: combines cosine similarity (pgvector) with full-text search (tsvector).
   * Results scored by: 0.7 * vector_score + 0.3 * text_score (normalized).
   */
  async hybridSearch(query: string, options: SearchOptions): Promise<SearchResult[]> {
    const { audience, documentType, category, limit = 5, similarityThreshold = 0.3 } = options;

    const queryEmbedding = await this.embeddingService.embedText(query);
    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    // All values are parameterized to prevent SQL injection
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    let paramIndex = 1;

    // $1: embedding vector
    params.push(embeddingStr);
    const embeddingIdx = paramIndex++;

    conditions.push(`(audience = $${paramIndex} OR audience = 'all')`);
    params.push(audience);
    paramIndex++;

    if (documentType) {
      conditions.push(`document_type = $${paramIndex}`);
      params.push(documentType);
      paramIndex++;
    }

    if (category) {
      conditions.push(`category = $${paramIndex}`);
      params.push(category);
      paramIndex++;
    }

    conditions.push('embedding IS NOT NULL');

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // $N: full-text query
    const queryIdx = paramIndex++;
    params.push(query);

    // $N: similarity threshold
    const thresholdIdx = paramIndex++;
    params.push(similarityThreshold);

    // $N: result limit
    const limitIdx = paramIndex++;
    params.push(limit);

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
          1 - (embedding <=> $${embeddingIdx}::vector) AS vector_score,
          ts_rank_cd(content_tsv, plainto_tsquery('english', $${queryIdx})) AS text_score
        FROM knowledge_documents
        ${whereClause}
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
      WHERE vector_score >= $${thresholdIdx}
      ORDER BY similarity DESC
      LIMIT $${limitIdx}
    `;

    const results = await this.prisma.$queryRawUnsafe<any[]>(sql, ...params);

    return results.map((row) => ({
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
