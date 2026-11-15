import { Inject, Injectable, Logger } from '@nestjs/common';
import { AiSurface } from '@appshore/db';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { EmbeddingService } from '../../infrastructure/providers/embedding.service';
import { AiRouteResolver } from '../../routing/ai-route-resolver.service';
import { chunkMarkdown, formatChunk } from '../../knowledge-base/content/chunker';
import { EMBED_BATCH_SIZE, MAX_CHUNKS_PER_SUBJECT } from '../constants';
import { MAX_SUBJECT_ID_LENGTH, SEARCH_SUBJECTS, type SearchSubject } from '../search-subject';

export type ReindexOutcome = 'indexed' | 'indexed-without-vectors' | 'removed' | 'unknown-subject';

interface PreparedChunk {
  section: string | null;
  content: string;
}

/**
 * Writes the search index for one record: read it through its subject, chunk, embed, then replace its rows in one
 * transaction. Running it twice gives the same rows, so a retried job and a rebuild are safe.
 *
 * Embedding runs before the transaction and never fails the write: when the tenant has no embedding route, or the
 * provider refuses, the chunks are stored without vectors and full-text search still finds them. A later run fills
 * the vectors in.
 */
@Injectable()
export class SearchIndexerService {
  private readonly logger = new Logger(SearchIndexerService.name);
  private readonly byType: ReadonlyMap<string, SearchSubject>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingService,
    private readonly routes: AiRouteResolver,
    @Inject(SEARCH_SUBJECTS) subjects: readonly SearchSubject[],
  ) {
    this.byType = new Map(subjects.map((s) => [s.type, s]));
  }

  async reindex(tenantId: number, subjectType: string, subjectId: string): Promise<ReindexOutcome> {
    const subject = this.byType.get(subjectType);
    if (!subject || subjectId.length > MAX_SUBJECT_ID_LENGTH) {
      this.logger.warn(`Search index: no subject "${subjectType}" for ${subjectId}; nothing written`);
      return 'unknown-subject';
    }
    const record = await subject.load(tenantId, subjectId);
    const chunks = record ? this.prepare(record.title, record.text) : [];
    if (!record || chunks.length === 0) {
      await this.prisma.searchChunk.deleteMany({ where: { tenantId, subjectType, subjectId } });
      return 'removed';
    }

    const vectors = await this.embedChunks(
      tenantId,
      chunks.map((c) => c.content),
    );
    const model = vectors ? await this.modelId(tenantId) : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`search:${tenantId}:${subjectType}:${subjectId}`}))`;
      await tx.searchChunk.deleteMany({ where: { tenantId, subjectType, subjectId } });
      for (const [ix, chunk] of chunks.entries()) {
        const vector = vectors ? `[${vectors[ix].join(',')}]` : null;
        await tx.$executeRaw`
          INSERT INTO search_chunks
            (tenant_id, subject_type, subject_id, chunk_ix, title, href, section, content, embedding_model, embedding)
          VALUES
            (${tenantId}, ${subjectType}, ${subjectId}, ${ix}, ${record.title.slice(0, 500)}, ${record.href ?? null},
             ${chunk.section}, ${chunk.content}, ${model}, ${vector}::vector)`;
      }
    });
    return vectors ? 'indexed' : 'indexed-without-vectors';
  }

  private prepare(title: string, text: string): PreparedChunk[] {
    return chunkMarkdown(text)
      .slice(0, MAX_CHUNKS_PER_SUBJECT)
      .map((c) => ({ section: c.section, content: formatChunk(title, c.section, c.text) }));
  }

  /** The chunks' vectors in order, or null when they cannot be embedded now (the reason is logged). */
  private async embedChunks(tenantId: number, texts: string[]): Promise<number[][] | null> {
    try {
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
        const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
        out.push(...(await this.embeddings.embedBatch(batch, { tenantId, surface: AiSurface.EMBEDDING }, 'document')));
      }
      return out;
    } catch (err) {
      const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      this.logger.warn(`Search index: tenant ${tenantId} chunks stored without vectors (${reason})`);
      return null;
    }
  }

  private async modelId(tenantId: number): Promise<string | null> {
    try {
      return (await this.routes.resolve(tenantId, 'embedding')).embeddingModelId();
    } catch {
      return null;
    }
  }
}
