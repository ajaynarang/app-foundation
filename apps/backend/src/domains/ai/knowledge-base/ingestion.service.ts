import { createHash } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { generateId } from '@appshore/kernel/shared/utils/id-generator';
import { EmbeddingService } from '../infrastructure/providers/embedding.service';
import { AiNotConfigured } from '../routing/ai-not-configured.error';
import { loadAllEntries, type KnowledgeEntry } from './content/content-loader';
import { CHUNKER_VERSION, chunkMarkdown, formatChunk } from './content/chunker';

export interface IngestOptions {
  /** Re-embed every file even when its content hash is unchanged. */
  force?: boolean;
}

export interface IngestResult {
  /** Content files stored for the first time. */
  added: string[];
  /** Files whose content (or the chunker) changed. */
  updated: string[];
  /** Unchanged files whose stored chunks had no vectors, now embedded (after vectors were cleared, or a run with no route). */
  reembedded: string[];
  unchanged: number;
  /** Files gone from the content folder (or emptied), and legacy rows the old ingester left. */
  removed: string[];
  /** Chunks written this run. */
  chunkCount: number;
  /** False when no platform embedding route is configured: the chunks written this run have no vector. */
  embedded: boolean;
}

/** What the table holds for one content file. */
interface StoredFile {
  hash: string | null;
  /** At least one of its chunks has no vector. */
  missingVectors: boolean;
}

interface PreparedDoc {
  entry: KnowledgeEntry;
  hash: string;
  chunks: { section: string | null; content: string }[];
  /** `vectors`: the content is unchanged and is rewritten only to embed it, so with no route it is left alone. */
  reason: 'content' | 'vectors';
}

/** The transaction that swaps one file's chunks. Generous, because a by-hand sync may run through a tunnel. */
const REPLACE_TIMEOUT_MS = 30_000;

/**
 * Hash of everything that shapes a file's stored chunks. A chunker change bumps CHUNKER_VERSION, which changes every
 * hash and re-embeds the corpus.
 */
export function contentHash(entry: KnowledgeEntry): string {
  const { title, documentType, audience, category, keywords, content } = entry;
  return createHash('sha256')
    .update(JSON.stringify({ v: CHUNKER_VERSION, title, documentType, audience, category, keywords, content }))
    .digest('hex');
}

/**
 * Syncs `knowledge_documents` with the content folder (`pnpm seed:knowledge`). Idempotent: an unchanged file costs
 * nothing, so it can run on every deploy.
 *
 * - Plans per file by content hash: add, update, skip, remove. A file whose chunks lack vectors is re-embedded even
 *   when its hash is unchanged, once an embedding route exists.
 * - Embeds before it touches the table, so a provider failure leaves the knowledge base as it was. The content is
 *   global (no tenant): it embeds on the platform route as documents and writes no tenant ledger row.
 * - Swaps each file's chunks in one transaction under a per-file advisory lock, so a search never sees a file
 *   half-written and two overlapping runs cannot both insert a copy.
 * - Touches only rows whose `sourcePath` it wrote. A row a product inserted by other means (null `sourcePath`) is
 *   never deleted.
 *
 * With no platform embedding route (`COHERE_API_KEY` unset) new and changed files are stored for full-text search
 * only, and the result says so.
 */
@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  async ingestAll(options: IngestOptions = {}): Promise<IngestResult> {
    const entries = loadAllEntries();
    const plan = this.planChanges(entries, await this.storedFiles(), options);

    const vectors = await this.embedOrNull(plan.toWrite.flatMap((d) => d.chunks.map((c) => c.content)));
    const embedded = vectors !== null;
    // No route: a file that changed is still stored (full-text works); one rewritten only to embed it is left as is.
    const toWrite = embedded ? plan.toWrite : plan.toWrite.filter((d) => d.reason === 'content');
    const reembedded = embedded
      ? plan.toWrite.filter((d) => d.reason === 'vectors').map((d) => d.entry.sourcePath)
      : [];

    let cursor = 0;
    for (const doc of toWrite) {
      const docVectors = vectors ? vectors.slice(cursor, cursor + doc.chunks.length) : null;
      cursor += doc.chunks.length;
      await this.replaceDocument(doc, docVectors);
    }

    if (plan.removed.length > 0) {
      await this.prisma.knowledgeDocument.deleteMany({ where: { sourcePath: { in: plan.removed } } });
    }

    const result: IngestResult = {
      added: plan.added,
      updated: plan.updated,
      reembedded,
      unchanged: plan.unchanged + (plan.toWrite.length - toWrite.length),
      removed: plan.removed,
      chunkCount: toWrite.reduce((n, d) => n + d.chunks.length, 0),
      embedded,
    };
    this.logger.log(
      `Knowledge base: ${result.added.length} added, ${result.updated.length} updated, ` +
        `${result.reembedded.length} re-embedded, ${result.unchanged} unchanged, ${result.removed.length} removed`,
    );
    return result;
  }

  /** Decide, per content file, whether to skip, (re)write or remove it. */
  private planChanges(
    entries: KnowledgeEntry[],
    stored: Map<string, StoredFile>,
    options: IngestOptions,
  ): { added: string[]; updated: string[]; removed: string[]; unchanged: number; toWrite: PreparedDoc[] } {
    const added: string[] = [];
    const updated: string[] = [];
    const removed: string[] = [];
    const toWrite: PreparedDoc[] = [];
    let unchanged = 0;

    for (const entry of entries) {
      const hash = contentHash(entry);
      const previous = stored.get(entry.sourcePath);
      const sameContent = !options.force && previous !== undefined && previous.hash === hash;
      if (sameContent && previous?.missingVectors === false) {
        unchanged++;
        continue;
      }
      const chunks = chunkMarkdown(entry.content).map((c) => ({
        section: c.section,
        content: formatChunk(entry.title, c.section, c.text),
      }));
      if (chunks.length === 0) {
        // Edited down to nothing: its old chunks must stop being searchable.
        if (previous) removed.push(entry.sourcePath);
        continue;
      }
      toWrite.push({ entry, hash, chunks, reason: sameContent ? 'vectors' : 'content' });
      if (!previous) added.push(entry.sourcePath);
      else if (!sameContent) updated.push(entry.sourcePath);
    }

    // Stored files no longer in the content folder, including the `legacy:` rows the migration marked.
    const current = new Set(entries.map((e) => e.sourcePath));
    for (const sourcePath of stored.keys()) {
      if (!current.has(sourcePath)) removed.push(sourcePath);
    }
    return { added, updated, removed, unchanged, toWrite };
  }

  /** Every file the ingester wrote, with its hash and whether any chunk lacks a vector. Null-path rows are not ours. */
  private async storedFiles(): Promise<Map<string, StoredFile>> {
    const rows = await this.prisma.$queryRaw<
      { source_path: string; content_hash: string | null; missing_vectors: boolean }[]
    >`
      SELECT source_path, MAX(content_hash) AS content_hash, BOOL_OR(embedding IS NULL) AS missing_vectors
        FROM knowledge_documents
       WHERE source_path IS NOT NULL
       GROUP BY source_path`;
    return new Map(
      rows.map((r) => [r.source_path, { hash: r.content_hash, missingVectors: Boolean(r.missing_vectors) }]),
    );
  }

  /** The chunks' vectors, or null when no platform embedding route is configured. Any other failure throws. */
  private async embedOrNull(texts: string[]): Promise<number[][] | null> {
    if (texts.length === 0) return [];
    try {
      return await this.embeddingService.embedForPlatform(texts, 'document');
    } catch (err) {
      if (!(err instanceof AiNotConfigured)) throw err;
      this.logger.warn('No platform embedding route (COHERE_API_KEY unset): storing chunks for full-text search only');
      return null;
    }
  }

  /** Replace one file's chunks in one transaction, serialised per file. `vectors` null stores them without vectors. */
  private async replaceDocument(doc: PreparedDoc, vectors: number[][] | null): Promise<void> {
    const { entry, hash, chunks } = doc;
    const parentDocId = chunks.length > 1 ? generateId('doc') : null;

    await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`kb:${entry.sourcePath}`}))`;
        await tx.knowledgeDocument.deleteMany({ where: { sourcePath: entry.sourcePath } });

        for (let i = 0; i < chunks.length; i++) {
          const record = await tx.knowledgeDocument.create({
            data: {
              documentId: generateId('doc'),
              title: entry.title,
              content: chunks[i].content,
              section: chunks[i].section,
              documentType: entry.documentType,
              audience: entry.audience,
              category: entry.category,
              keywords: entry.keywords,
              chunkIndex: i,
              parentDocId,
              totalChunks: chunks.length,
              sourcePath: entry.sourcePath,
              contentHash: hash,
            },
            select: { id: true },
          });
          if (!vectors) continue;
          await tx.$executeRawUnsafe(
            `UPDATE knowledge_documents SET embedding = $1::vector WHERE id = $2`,
            `[${vectors[i].join(',')}]`,
            record.id,
          );
        }
      },
      { timeout: REPLACE_TIMEOUT_MS },
    );
  }
}
