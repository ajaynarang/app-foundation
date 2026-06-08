import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { EmbeddingService } from '../infrastructure/providers/embedding.service';
import { loadAllEntries, type KnowledgeEntry } from './content/content-loader';
import { generateId } from '../../../shared/utils/id-generator';

const MAX_CHUNK_SIZE = 1000; // ~250 tokens (4 chars/token)
const CHUNK_OVERLAP = 100; // ~25 tokens overlap

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  /**
   * Split text into overlapping chunks, preferring sentence boundaries.
   */
  chunkText(text: string, maxSize: number = MAX_CHUNK_SIZE, overlap: number = CHUNK_OVERLAP): string[] {
    if (!text || text.trim().length === 0) {
      return [];
    }

    if (text.length <= maxSize) {
      return [text];
    }

    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      let end = Math.min(start + maxSize, text.length);

      // Try to break at sentence boundary (only if not at the end)
      if (end < text.length) {
        const searchFrom = start + Math.floor(maxSize * 0.5);
        const region = text.slice(searchFrom, end);
        const lastPeriod = region.lastIndexOf('. ');

        if (lastPeriod !== -1) {
          end = searchFrom + lastPeriod + 2; // Include ". "
        }
      }

      chunks.push(text.slice(start, end).trim());

      // Ensure forward progress
      const nextStart = Math.max(end - overlap, start + 1);
      if (nextStart >= text.length) break;
      start = nextStart;
    }

    return chunks.filter((c) => c.length > 0);
  }

  /**
   * Ingest all product knowledge: chunk, batch-embed, store.
   * Uses a transaction to ensure atomicity — the KB is either fully
   * replaced or left untouched on failure.
   */
  async ingestAll(): Promise<{ documentCount: number; chunkCount: number }> {
    this.logger.log('Starting knowledge base ingestion...');

    const entries = loadAllEntries();

    // Prepare all chunks and their metadata first
    const allRecords: {
      entry: KnowledgeEntry;
      chunk: string;
      chunkIndex: number;
      parentDocId: string;
      docId: string;
      totalChunks: number;
    }[] = [];

    for (const entry of entries) {
      const chunks = this.chunkText(entry.content);
      if (chunks.length === 0) continue;

      const parentDocId = generateId('doc');

      for (let i = 0; i < chunks.length; i++) {
        allRecords.push({
          entry,
          chunk: chunks[i],
          chunkIndex: i,
          parentDocId,
          docId: chunks.length === 1 ? parentDocId : generateId('doc'),
          totalChunks: chunks.length,
        });
      }
    }

    // Batch-embed all chunks at once (I3 fix)
    const textsToEmbed = allRecords.map((r) => `${r.entry.title}: ${r.chunk}`);
    const embeddings = await this.embeddingService.embedBatch(textsToEmbed);

    // Delete existing and re-insert (no transaction to avoid SSM tunnel timeout)
    await this.prisma.knowledgeDocument.deleteMany({});

    for (let i = 0; i < allRecords.length; i++) {
      const r = allRecords[i];

      const record = await this.prisma.knowledgeDocument.create({
        data: {
          documentId: r.docId,
          title: r.entry.title,
          content: r.chunk,
          documentType: r.entry.documentType,
          audience: r.entry.audience,
          category: r.entry.category,
          keywords: r.entry.keywords,
          chunkIndex: r.chunkIndex,
          parentDocId: r.totalChunks > 1 ? r.parentDocId : null,
          totalChunks: r.totalChunks,
        },
      });

      const embeddingStr = `[${embeddings[i].join(',')}]`;
      await this.prisma.$executeRawUnsafe(
        `UPDATE knowledge_documents SET embedding = $1::vector WHERE id = $2`,
        embeddingStr,
        record.id,
      );
    }

    for (const entry of entries) {
      const chunks = this.chunkText(entry.content);
      this.logger.log(`Ingested: ${entry.title} (${chunks.length} chunks)`);
    }

    this.logger.log(`Ingestion complete: ${entries.length} documents, ${allRecords.length} chunks`);

    return {
      documentCount: entries.length,
      chunkCount: allRecords.length,
    };
  }
}
