import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MemoryPolarity, MemoryScope, Prisma } from '@appshore/db';

import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { EmbeddingService } from '../../../ai/infrastructure/providers/embedding.service';

/**
 * DeskMemoryService — agent-scoped long-term memory.
 *
 * Read path: `findRelevant(...)` — scored retrieval blending structural
 * (entityRef overlap) + semantic (cosine on contentEmbedding) + recency
 * + utility + confidence, minus a contradiction penalty when the candidate
 * memory's polarity opposes the query intent. Used by hydrate.step.
 *
 * UI surface: `listForUI`, `setPinned`, `updateForTenant`, `softDelete`.
 *
 * Writes live in `DeskMemoryWriterService` (close.step + Rules-tab
 * "Add a rule"). Reinforcement (confidence delta + auto-deactivate) lives
 * in `DeskMemoryReinforcer`.
 */
@Injectable()
export class DeskMemoryService {
  private readonly logger = new Logger(DeskMemoryService.name);

  // Tunables — exposed as constants so tests + reviewers can grep.
  static readonly MAX_CANDIDATES = 500;
  static readonly DEFAULT_LIMIT = 5;
  static readonly SCORE_FLOOR = 0.2;
  static readonly RECENCY_HALF_LIFE_DAYS = 30;
  static readonly UTILITY_LOG_BASE = 100;
  static readonly CONTRADICTION_PENALTY = 0.5;
  static readonly W_STRUCTURAL = 0.4;
  static readonly W_SEMANTIC = 0.3;
  static readonly W_RECENCY = 0.15;
  static readonly W_UTILITY = 0.1;
  static readonly W_CONFIDENCE = 0.05;

  constructor(
    private readonly prisma: PrismaService,
    private readonly embedder: EmbeddingService,
  ) {}

  // ───────────────────────────────────────────────────────────────────────
  // Read path — used by hydrate.step
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Score and return the top memories for a hydrate step.
   *
   * @param queryContext — the LLM-facing description of THIS run (e.g. invoice
   *   summary). Embedded once and cosine-compared against every candidate row.
   * @param queryIntent — when provided, candidates whose polarity opposes the
   *   intent are penalised by `CONTRADICTION_PENALTY`. Used by hydrate.step
   *   when the responsibility's intent is well-defined (e.g. a follow-up
   *   responsibility might default to `MemoryPolarity.REINFORCE` — keep nudging).
   */
  async findRelevant(input: {
    tenantId: number;
    agentId: number;
    entityRef: Record<string, string | number | null>;
    queryContext: string;
    queryIntent?: MemoryPolarity;
    limit?: number;
  }): Promise<MemoryScored[]> {
    const queryEmbedding = await this.safeEmbed(input.queryContext);
    const rows = await this.fetchCandidates(input.tenantId, input.agentId);

    const now = Date.now();
    const scored = rows.map((row) => ({ row, score: this.scoreRow(row, queryEmbedding, input, now) }));

    return scored
      .filter((x) => x.score >= DeskMemoryService.SCORE_FLOOR)
      .sort((a, b) => b.score - a.score)
      .slice(0, input.limit ?? DeskMemoryService.DEFAULT_LIMIT)
      .map(({ row }) => this.toScoredShape(row));
  }

  /**
   * Fetch active, non-expired memory rows for one (tenant, agent). Uses
   * raw SQL because Prisma's generated type can't expose the
   * `Unsupported("vector(1536)")` column directly — we cast the vector
   * back to a JSON array on the way out so the in-memory scorer can
   * cosine-compare it against the query embedding.
   *
   * `ORDER BY confidence DESC, updated_at DESC` is load-bearing — without
   * it, when the corpus blows past MAX_CANDIDATES Postgres returns rows
   * in physical order and the LIMIT silently rotates the candidate set,
   * making `findRelevant` non-deterministic between back-to-back runs.
   * The ordering here picks the highest-signal slice for the in-memory
   * scorer to refine.
   *
   * Per-agent corpora typically run ~50-200 rows; even at the 500 ceiling
   * the cosine pass takes <5ms.
   */
  private async fetchCandidates(tenantId: number, agentId: number): Promise<MemoryCandidate[]> {
    return this.prisma.$queryRaw<MemoryCandidate[]>`
      SELECT
        id,
        scope,
        polarity,
        content,
        entity_ref         AS "entityRef",
        confidence,
        usage_count        AS "usageCount",
        is_pinned          AS "isPinned",
        created_at         AS "createdAt",
        CASE
          WHEN content_embedding IS NULL THEN NULL
          ELSE content_embedding::text
        END                AS "contentEmbedding"
      FROM desk_memories
      WHERE tenant_id = ${tenantId}
        AND agent_id  = ${agentId}
        AND is_active = true
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY confidence DESC, updated_at DESC
      LIMIT ${DeskMemoryService.MAX_CANDIDATES}
    `;
  }

  // ───────────────────────────────────────────────────────────────────────
  // UI surface — Crew → Agent sheet → Rules tab + Memory tab
  // ───────────────────────────────────────────────────────────────────────

  async listForUI(input: {
    tenantId: number;
    agentKey?: string;
    scope?: MemoryScope;
    polarity?: MemoryPolarity;
    /** Rules-tab vs Memory-tab discriminator. Omit for unfiltered. */
    authoredByOperatorOnly?: boolean;
    sourceEpisodeId?: string;
    activeOnly: boolean;
    limit: number;
  }): Promise<MemoryListRow[]> {
    const where: Prisma.DeskMemoryWhereInput = {
      tenantId: input.tenantId,
      ...(input.agentKey ? { agent: { key: input.agentKey } } : {}),
      ...(input.scope ? { scope: input.scope } : {}),
      ...(input.polarity ? { polarity: input.polarity } : {}),
      ...(input.sourceEpisodeId ? { sourceEpisodeId: input.sourceEpisodeId } : {}),
      ...(input.activeOnly ? { isActive: true } : {}),
      ...(input.authoredByOperatorOnly === true ? { authoredByUserId: { not: null } } : {}),
      ...(input.authoredByOperatorOnly === false ? { authoredByUserId: null } : {}),
    };

    const rows = await this.prisma.deskMemory.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: input.limit,
      select: {
        id: true,
        agent: { select: { key: true } },
        scope: true,
        polarity: true,
        content: true,
        sourceEpisodeId: true,
        entityRef: true,
        entityPredicate: true,
        authoredByUserId: true,
        isActive: true,
        isPinned: true,
        createdAt: true,
        updatedAt: true,
        expiresAt: true,
      },
    });

    return rows.map((r) => ({
      id: r.id,
      agentKey: r.agent.key,
      scope: r.scope,
      polarity: r.polarity,
      content: r.content,
      sourceEpisodeId: r.sourceEpisodeId,
      entityRef: (r.entityRef as Record<string, unknown> | null) ?? null,
      entityPredicate: (r.entityPredicate as Record<string, unknown> | null) ?? null,
      authoredByUserId: r.authoredByUserId,
      isActive: r.isActive,
      isPinned: r.isPinned,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      expiresAt: r.expiresAt?.toISOString() ?? null,
    }));
  }

  /**
   * Patch one memory. Tenant scoping enforced here — caller doesn't need
   * to load-then-check.
   *
   * `content` edits are restricted to operator-authored playbook rows
   * (`authoredByUserId IS NOT NULL`). LLM-extracted memories stay
   * read-only on the server too — the design relies on this to keep
   * the reinforced corpus single-voiced. The UI hides the Edit button
   * for these rows; this rejection is the matching server-side enforcement.
   * `isActive` toggling is allowed for both kinds (Remove flow).
   */
  async updateForTenant(input: {
    tenantId: number;
    memoryId: string;
    content?: string;
    isActive?: boolean;
  }): Promise<void> {
    const row = await this.assertInTenant(input.memoryId, input.tenantId);
    if (input.content !== undefined && row.authoredByUserId === null) {
      throw new ForbiddenException('Cannot edit content of an LLM-extracted memory. Pin or remove it instead.');
    }
    await this.prisma.deskMemory.update({
      where: { id: input.memoryId },
      data: {
        ...(input.content !== undefined ? { content: input.content } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
  }

  /**
   * Pin or unpin a memory. Pinned memories are exempt from auto-decay in
   * the reinforcer.
   */
  async setPinned(input: { tenantId: number; memoryId: string; isPinned: boolean }): Promise<void> {
    await this.assertInTenant(input.memoryId, input.tenantId);
    await this.prisma.deskMemory.update({
      where: { id: input.memoryId },
      data: { isPinned: input.isPinned },
    });
  }

  /** Soft-delete (isActive=false) so audit trails + sourceEpisodeId stay intact. */
  async softDelete(memoryId: string, tenantId: number): Promise<void> {
    await this.assertInTenant(memoryId, tenantId);
    await this.prisma.deskMemory.update({
      where: { id: memoryId },
      data: { isActive: false },
    });
  }

  // ───────────────────────────────────────────────────────────────────────
  // Internals
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Confirm the memory belongs to the calling tenant + return the row's
   * authorship so callers can apply scope-specific rules (e.g.
   * updateForTenant blocks content edits on LLM-extracted rows).
   */
  private async assertInTenant(
    memoryId: string,
    tenantId: number,
  ): Promise<{ tenantId: number; authoredByUserId: number | null }> {
    const row = await this.prisma.deskMemory.findUnique({
      where: { id: memoryId },
      select: { tenantId: true, authoredByUserId: true },
    });
    if (!row || row.tenantId !== tenantId) {
      throw new NotFoundException('Memory not found');
    }
    return row;
  }

  private async safeEmbed(text: string): Promise<number[] | null> {
    try {
      return await this.embedder.embedText(text);
    } catch (err) {
      this.logger.warn(`Embedder unreachable; falling back to structural-only scoring (${describeError(err)})`);
      return null;
    }
  }

  private scoreRow(
    row: MemoryCandidate,
    queryEmbedding: number[] | null,
    input: { entityRef: Record<string, string | number | null>; queryIntent?: MemoryPolarity },
    now: number,
  ): number {
    const structural = entityRefOverlap(input.entityRef, row.entityRef as Record<string, unknown> | null);
    const rowEmbedding = parsePgVector(row.contentEmbedding);
    const semantic = queryEmbedding && rowEmbedding ? cosine(queryEmbedding, rowEmbedding) : 0;
    const createdAt = row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt);
    const ageMs = now - createdAt.getTime();
    const recency = Math.exp(-ageMs / (DeskMemoryService.RECENCY_HALF_LIFE_DAYS * 86_400_000));
    const utility = Math.log(1 + row.usageCount) / Math.log(1 + DeskMemoryService.UTILITY_LOG_BASE);
    const base =
      DeskMemoryService.W_STRUCTURAL * structural +
      DeskMemoryService.W_SEMANTIC * semantic +
      DeskMemoryService.W_RECENCY * recency +
      DeskMemoryService.W_UTILITY * utility +
      DeskMemoryService.W_CONFIDENCE * row.confidence;
    return base - this.contradictionPenalty(row, input);
  }

  /**
   * A memory contradicts the query intent when:
   *   • Same entity (structural overlap > 0)
   *   • AND its polarity opposes the intent
   * (intent=reinforce + memory=CORRECT, or intent=correct + memory=REINFORCE)
   *
   * Pinned rows escape contradiction penalty — the operator explicitly said
   * "trust this memory". Surfacing it gives the assistant the chance to honor the
   * pinned guidance even when current intent disagrees.
   */
  private contradictionPenalty(
    row: MemoryCandidate,
    input: { entityRef: Record<string, string | number | null>; queryIntent?: MemoryPolarity },
  ): number {
    if (!input.queryIntent) return 0;
    if (row.isPinned) return 0;
    const overlaps = entityRefOverlap(input.entityRef, row.entityRef as Record<string, unknown> | null) > 0;
    if (!overlaps) return 0;
    const opposes =
      (input.queryIntent === MemoryPolarity.REINFORCE && row.polarity === MemoryPolarity.CORRECT) ||
      (input.queryIntent === MemoryPolarity.CORRECT && row.polarity === MemoryPolarity.REINFORCE);
    return opposes ? DeskMemoryService.CONTRADICTION_PENALTY : 0;
  }

  private toScoredShape(row: MemoryCandidate): MemoryScored {
    const createdAt = row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt);
    return {
      id: row.id,
      scope: row.scope,
      polarity: row.polarity,
      content: row.content,
      confidence: row.confidence,
      createdAt: createdAt.toISOString(),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Public response shapes
// ─────────────────────────────────────────────────────────────────────────

export interface MemoryScored {
  id: string;
  scope: MemoryScope;
  polarity: MemoryPolarity;
  content: string;
  confidence: number;
  createdAt: string;
}

export interface MemoryListRow {
  id: string;
  agentKey: string;
  scope: MemoryScope;
  polarity: MemoryPolarity;
  content: string;
  sourceEpisodeId: string | null;
  entityRef: Record<string, unknown> | null;
  entityPredicate: Record<string, unknown> | null;
  authoredByUserId: number | null;
  isActive: boolean;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
}

// ─────────────────────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────────────────────

/**
 * Shape returned by the raw SQL `fetchCandidates` query. Distinct from
 * Prisma's generated DeskMemory type because we project `content_embedding`
 * (Postgres `Unsupported("vector(1536)")`) into a string the client can
 * parse — Prisma can't generate a proper type for the vector column.
 */
interface MemoryCandidate {
  id: string;
  scope: MemoryScope;
  polarity: MemoryPolarity;
  content: string;
  entityRef: unknown;
  confidence: number;
  usageCount: number;
  isPinned: boolean;
  createdAt: Date | string;
  contentEmbedding: string | null;
}

/**
 * pgvector's `::text` cast emits `[0.1,0.2,…]`. Parse back into a
 * number[] for the in-memory cosine pass. Returns null on malformed
 * input so semantic scoring degrades gracefully.
 */
function parsePgVector(literal: string | null): number[] | null {
  if (!literal) return null;
  const trimmed = literal.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return null;
  const parts = trimmed.slice(1, -1).split(',');
  const out = new Array<number>(parts.length);
  for (let i = 0; i < parts.length; i++) {
    const n = Number(parts[i]);
    if (Number.isNaN(n)) return null;
    out[i] = n;
  }
  return out;
}

/**
 * Fraction of the query's entityRef keys that match the memory's entityRef.
 * Returns 0 when memoryRef is null. Null query values never contribute.
 */
function entityRefOverlap(
  queryRef: Record<string, string | number | null>,
  memoryRef: Record<string, unknown> | null,
): number {
  if (!memoryRef) return 0;
  const queryEntries = Object.entries(queryRef).filter(([, v]) => v != null);
  if (queryEntries.length === 0) return 0;
  const matches = queryEntries.filter(([k, v]) => memoryRef[k] === v).length;
  return matches / queryEntries.length;
}

function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
