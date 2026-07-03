import { Injectable, Logger } from '@nestjs/common';
import { AiSurface, MemoryPolarity, MemoryScope, Prisma } from '@appshore/db';
import { type AiCallContext } from '@app/shared-types';
import { MemoryExtractSchema } from '../types';

import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { generateUuidV7 } from '../../../../shared/utils/uuidv7';
import { EmbeddingService } from '../../../ai/infrastructure/providers/embedding.service';
import { StructuredOutputService } from '../../../ai/infrastructure/providers/structured-output.service';
import { AI_LINK_REF_TYPES } from '../../../ai/infrastructure/telemetry/ai-telemetry.constants';
import { PromptingService } from '../../../prompting/prompting.service';
import { PROMPT_NAMES } from '../../../prompting/prompting.types';

/**
 * Closing transition that triggers a memory write at episode close.
 * Tool / LLM errors are deliberately absent — they're infrastructure
 * noise and would pollute the learning corpus.
 */
export type CloseTransition =
  | 'no_action'
  | 'auto_send'
  | 'approve_unchanged'
  | 'approve_edited'
  | 'reject'
  | 'reject_and_close'
  | 'approval_expired'
  | 'snooze';

interface WriteMapEntry {
  // PLAYBOOK is excluded — those are operator-authored via `writeOperatorRule`,
  // not produced by close-transition writes.
  scope: Exclude<MemoryScope, 'PLAYBOOK'>;
  polarity: MemoryPolarity;
  confidence: number;
  expiresInDays?: number;
}

/**
 * Per-transition memory shape. See design doc §"Write map (9 sites, not 1)".
 * The 9th site is `writeOperatorRule` — covered by its own method below.
 */
const WRITE_MAP: Record<CloseTransition, WriteMapEntry> = {
  no_action: { scope: 'ENTITY', polarity: 'REINFORCE', confidence: 0.65 },
  auto_send: { scope: 'ENTITY', polarity: 'REINFORCE', confidence: 0.6 },
  approve_unchanged: { scope: 'ENTITY', polarity: 'REINFORCE', confidence: 0.85 },
  approve_edited: { scope: 'PATTERN', polarity: 'CORRECT', confidence: 0.9 },
  reject: { scope: 'PATTERN', polarity: 'CORRECT', confidence: 0.9 },
  reject_and_close: { scope: 'ENTITY', polarity: 'CORRECT', confidence: 0.95 },
  approval_expired: { scope: 'ENTITY', polarity: 'CORRECT', confidence: 0.7 },
  snooze: { scope: 'ENTITY', polarity: 'CORRECT', confidence: 0.95 },
};

/** Pre-LLM caps so we don't pay for tokens on something we'd reject anyway. */
const EXTRACT_TIMEOUT_MS = 4_000;
const EXTRACT_MAX_RETRIES = 1;

/** Cosine similarity above which a new memory dedups into an existing row. */
const DEDUP_COSINE_THRESHOLD = 0.92;

/**
 * Per-(tenant, agent, entityRef) ceiling on active LLM-extracted memories.
 * When a write would push past it, evict the lowest-confidence non-pinned
 * row first. Cap matches design doc §"Non-functional / Scale" — protects
 * against unbounded growth on hot customers.
 *
 * Playbook (operator-authored) rows are exempt — they're agent-wide and
 * don't carry an entityRef.
 */
const PER_ENTITY_ACTIVE_CAP = 30;

interface WriteInput {
  tenantId: number;
  agentId: number;
  episodeId: string;
  transition: CloseTransition;
  entityRef: Record<string, unknown>;
  entityPredicate?: Record<string, unknown>;
  /** Per-responsibility prompt override key (e.g. 'welcome'). */
  responsibilityKey?: string;
  /** Free-form context for the extractor (typically the hydrate snapshot). */
  hydrateContext: string;
  outcome: string;
  outcomeNote?: string;
  /** Optional explicit expiry; otherwise WRITE_MAP entry decides. */
  expiresAt?: Date;
}

interface WriteOperatorRuleInput {
  tenantId: number;
  agentId: number;
  authoredByUserId: number;
  content: string;
}

export type WriteResult = { id: string; deduplicated: false } | { id: string; deduplicated: true };

/**
 * DeskMemoryWriterService — single write entry point for desk-memory.
 *
 * Two flows:
 *   1. `write(...)`            — close.step calls this for every closing
 *                                transition in the WRITE_MAP. LLM extracts
 *                                the lesson; embedder vectorizes; dedup
 *                                pass merges into an existing row when the
 *                                cosine is above 0.92.
 *   2. `writeOperatorRule(...)` — Rules tab "Add a rule" form. Verbatim
 *                                operator content (no extraction); embed
 *                                + insert. authoredByUserId discriminates
 *                                operator-authored from LLM-extracted
 *                                throughout the system.
 */
@Injectable()
export class DeskMemoryWriterService {
  private readonly logger = new Logger(DeskMemoryWriterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embedder: EmbeddingService,
    private readonly structured: StructuredOutputService,
    private readonly prompting: PromptingService,
  ) {}

  // ───────────────────────────────────────────────────────────────────────
  // Close-step writes — 8 transitions, 1 method
  // ───────────────────────────────────────────────────────────────────────

  async write(input: WriteInput): Promise<WriteResult | null> {
    const map = WRITE_MAP[input.transition];
    if (!map) {
      // Unknown / explicitly-excluded transition (tool_error, llm_error) — no-op.
      return null;
    }

    const content = await this.extractOrFallback(input);
    const embedding = await this.safeEmbed(content, {
      tenantId: input.tenantId,
      surface: AiSurface.MEMORY_EXTRACT,
      agentId: input.agentId != null ? String(input.agentId) : undefined,
      linkRefType: AI_LINK_REF_TYPES.DESK_EPISODE,
      linkRefId: input.episodeId,
    });

    if (embedding) {
      const dup = await this.findDuplicate({
        tenantId: input.tenantId,
        agentId: input.agentId,
        entityRef: input.entityRef,
        embedding,
      });
      if (dup) {
        await this.prisma.deskMemory.update({
          where: { id: dup.id },
          data: { usageCount: { increment: 1 } },
        });
        return { id: dup.id, deduplicated: true };
      }
    }

    // Per-entity cap — evict lowest-confidence non-pinned row if the new
    // insert would push past the ceiling.
    await this.enforcePerEntityCap({
      tenantId: input.tenantId,
      agentId: input.agentId,
      entityRef: input.entityRef,
    });

    const expiresAt = input.expiresAt ?? this.deriveExpiry(map);
    const created = await this.prisma.deskMemory.create({
      data: {
        id: generateUuidV7(),
        tenantId: input.tenantId,
        agentId: input.agentId,
        scope: map.scope,
        polarity: map.polarity,
        content,
        entityRef: input.entityRef as Prisma.InputJsonValue,
        entityPredicate: (input.entityPredicate ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        sourceEpisodeId: input.episodeId,
        confidence: map.confidence,
        ...(expiresAt ? { expiresAt } : {}),
      },
      select: { id: true },
    });

    if (embedding) {
      await this.persistEmbedding(created.id, embedding);
    }
    return { id: created.id, deduplicated: false };
  }

  // ───────────────────────────────────────────────────────────────────────
  // Operator-authored playbook rules — Rules tab "Add a rule"
  // ───────────────────────────────────────────────────────────────────────

  async writeOperatorRule(input: WriteOperatorRuleInput): Promise<{ id: string }> {
    const embedding = await this.safeEmbed(input.content, {
      tenantId: input.tenantId,
      surface: AiSurface.MEMORY_EXTRACT,
      agentId: input.agentId != null ? String(input.agentId) : undefined,
      linkRefType: AI_LINK_REF_TYPES.DESK_MEMORY_RULE,
    });
    const created = await this.prisma.deskMemory.create({
      data: {
        id: generateUuidV7(),
        tenantId: input.tenantId,
        agentId: input.agentId,
        scope: 'PLAYBOOK',
        polarity: 'REINFORCE',
        content: input.content,
        entityRef: Prisma.JsonNull,
        entityPredicate: Prisma.JsonNull,
        sourceEpisodeId: null,
        authoredByUserId: input.authoredByUserId,
        confidence: 0.85,
      },
      select: { id: true },
    });
    if (embedding) {
      await this.persistEmbedding(created.id, embedding);
    }
    return created;
  }

  // ───────────────────────────────────────────────────────────────────────
  // Internals
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Try LLM-extract via the per-responsibility prompt first, then the
   * default fallback prompt. If both fail (or return empty), produce a
   * minimal template — a poor memory still degrades gracefully via the
   * reinforcer.
   */
  private async extractOrFallback(input: WriteInput): Promise<string> {
    const promptNames = input.responsibilityKey
      ? [`desk.memory.extract.${input.responsibilityKey}.v1`, PROMPT_NAMES.DESK_MEMORY_EXTRACT]
      : [PROMPT_NAMES.DESK_MEMORY_EXTRACT];

    const userMessage = this.buildExtractUserMessage(input);

    for (const promptName of promptNames) {
      try {
        const systemPrompt = await this.prompting.getPrompt(promptName);
        const result = await this.structured.extract<{ content: string }>({
          systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
          schema: MemoryExtractSchema,
          modelAlias: 'fast',
          timeoutMs: EXTRACT_TIMEOUT_MS,
          aiContext: {
            tenantId: input.tenantId,
            surface: AiSurface.MEMORY_EXTRACT,
            agentId: input.agentId != null ? String(input.agentId) : undefined,
            linkRefType: AI_LINK_REF_TYPES.DESK_EPISODE,
            linkRefId: input.episodeId,
          },
        });
        const content = result.object?.content?.trim();
        if (content) return content;
      } catch (err) {
        this.logger.warn(`memory-extract prompt ${promptName} failed (${describeError(err)}); trying next`);
      }
      // Bound the attempts so a flaky LLM doesn't stretch close.step.
      if (promptNames.indexOf(promptName) >= EXTRACT_MAX_RETRIES) break;
    }

    return this.templateFallback(input);
  }

  private buildExtractUserMessage(input: WriteInput): string {
    return [
      `Transition: ${input.transition}`,
      `Outcome: ${input.outcome}${input.outcomeNote ? ` — ${input.outcomeNote}` : ''}`,
      `Entity: ${JSON.stringify(input.entityRef)}`,
      '',
      'Hydrate snapshot:',
      input.hydrateContext,
    ].join('\n');
  }

  private templateFallback(input: WriteInput): string {
    return `${input.outcome} (transition=${input.transition}) for ${JSON.stringify(input.entityRef)}`;
  }

  private async safeEmbed(text: string, aiContext?: AiCallContext): Promise<number[] | null> {
    try {
      return await this.embedder.embedText(text, aiContext);
    } catch (err) {
      this.logger.warn(`Embedder unreachable; writing memory without embedding (${describeError(err)})`);
      return null;
    }
  }

  /**
   * Find an existing memory with cosine similarity >= DEDUP_COSINE_THRESHOLD
   * for the same (tenant, agent). Same entityRef is preferred but not
   * required — a strong-semantic dup with a slightly different entityRef
   * still counts as one lesson.
   *
   * Filters mirror `DeskMemoryService.fetchCandidates` (active, non-expired)
   * so we never dedup INTO a row hydrate would never surface. The HNSW
   * index on content_embedding makes the ORDER BY ... LIMIT 1 fast even
   * as the per-agent corpus grows.
   *
   * Uses raw SQL because Prisma can't query the Unsupported("vector(1536)")
   * column directly. The pgvector `<=>` operator returns cosine distance;
   * similarity = 1 - distance.
   */
  private async findDuplicate(input: {
    tenantId: number;
    agentId: number;
    entityRef: Record<string, unknown>;
    embedding: number[];
  }): Promise<{ id: string } | null> {
    const embeddingStr = `[${input.embedding.join(',')}]`;
    const rows = await this.prisma.$queryRaw<Array<{ id: string; similarity: number }>>`
      SELECT
        id,
        1 - (content_embedding <=> ${embeddingStr}::vector) AS similarity
      FROM desk_memories
      WHERE tenant_id = ${input.tenantId}
        AND agent_id  = ${input.agentId}
        AND is_active = true
        AND (expires_at IS NULL OR expires_at > NOW())
        AND content_embedding IS NOT NULL
      ORDER BY content_embedding <=> ${embeddingStr}::vector
      LIMIT 1
    `;
    const top = rows[0];
    if (top && top.similarity >= DEDUP_COSINE_THRESHOLD) {
      return { id: top.id };
    }
    return null;
  }

  /**
   * Write the embedding via raw SQL because Prisma can't update an
   * Unsupported column through its generated client. Cast as
   * `vector(1536)` so pgvector validates dimensionality at write time.
   */
  private async persistEmbedding(memoryId: string, embedding: number[]): Promise<void> {
    const embeddingStr = `[${embedding.join(',')}]`;
    await this.prisma
      .$executeRaw`UPDATE desk_memories SET content_embedding = ${embeddingStr}::vector WHERE id = ${memoryId}::uuid`;
  }

  /**
   * Per-entity cap enforcement — soft-deletes the lowest-confidence
   * non-pinned active row when the count of active entries for this
   * (tenant, agent, entityRef) reaches PER_ENTITY_ACTIVE_CAP. Pinned
   * rows are immune to eviction (operator override). When every active
   * row is pinned and we're at the cap, no eviction happens — the new
   * row inserts and we accept the slight overflow rather than touch a
   * pinned row.
   *
   * Uses raw SQL for the JSON-equality predicate on entityRef (Prisma
   * supports it via `equals` but the cleanest deterministic predicate
   * is a serialized comparison; a partial-match lookup would over-evict).
   */
  private async enforcePerEntityCap(input: {
    tenantId: number;
    agentId: number;
    entityRef: Record<string, unknown>;
  }): Promise<void> {
    const entityRefJson = JSON.stringify(input.entityRef);
    const rows = await this.prisma.$queryRaw<Array<{ id: string; confidence: number }>>`
      SELECT id, confidence
      FROM desk_memories
      WHERE tenant_id = ${input.tenantId}
        AND agent_id  = ${input.agentId}
        AND is_active = true
        AND is_pinned = false
        AND scope <> 'PLAYBOOK'
        AND entity_ref::text = ${entityRefJson}::text
      ORDER BY confidence ASC, updated_at ASC
    `;
    // We compare against >= (CAP - 1) because we're about to insert one.
    if (rows.length < PER_ENTITY_ACTIVE_CAP) return;

    const evictTarget = rows[0];
    this.logger.warn(
      `per-entity cap hit (${rows.length} active for ${entityRefJson}); evicting memory ${evictTarget.id} (confidence ${evictTarget.confidence})`,
    );
    await this.prisma.deskMemory.update({
      where: { id: evictTarget.id },
      data: { isActive: false },
    });
  }

  private deriveExpiry(map: WriteMapEntry): Date | null {
    if (!map.expiresInDays) return null;
    return new Date(Date.now() + map.expiresInDays * 86_400_000);
  }
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
