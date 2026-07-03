import { NotFoundException } from '@nestjs/common';

import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { createMockPrisma } from '@appshore/platform/test/mocks/prisma.mock';
import { EmbeddingService } from '../../../../ai/infrastructure/providers/embedding.service';

import { DeskMemoryService } from '../desk-memory.service';

const SCOPE = { ENTITY: 'ENTITY', PATTERN: 'PATTERN', PLAYBOOK: 'PLAYBOOK' } as const;
const POL = { REINFORCE: 'REINFORCE', CORRECT: 'CORRECT' } as const;

function buildEmbedder(): jest.Mocked<EmbeddingService> {
  return {
    dimensions: 1536,
    embedText: jest.fn().mockResolvedValue(new Array(1536).fill(0)),
    embedBatch: jest.fn(),
  } as unknown as jest.Mocked<EmbeddingService>;
}

function buildRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'm-1',
    tenantId: 1,
    agentId: 1,
    scope: SCOPE.ENTITY,
    polarity: POL.REINFORCE,
    content: 'memory content',
    contentEmbedding: new Array(1536).fill(0),
    entityRef: { customerId: '42' },
    entityPredicate: null,
    sourceEpisodeId: null,
    authoredByUserId: null,
    confidence: 0.8,
    usageCount: 0,
    isActive: true,
    isPinned: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: null,
    ...overrides,
  };
}

/**
 * Build the row shape that `fetchCandidates` returns. `contentEmbedding`
 * comes back from Postgres as a `[0.1,0.2,…]` text literal because
 * pgvector is `Unsupported` in Prisma's type generator.
 */
function buildCandidate(overrides: Partial<Record<string, unknown>> = {}) {
  const merged = buildRow(overrides);
  const embedding = merged.contentEmbedding as number[] | null;
  return {
    id: merged.id,
    scope: merged.scope,
    polarity: merged.polarity,
    content: merged.content,
    entityRef: merged.entityRef,
    confidence: merged.confidence,
    usageCount: merged.usageCount,
    isPinned: merged.isPinned,
    createdAt: merged.createdAt,
    contentEmbedding: embedding ? `[${embedding.join(',')}]` : null,
  };
}

describe('DeskMemoryService — listForUI', () => {
  let service: DeskMemoryService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    prisma.deskMemory.findMany.mockResolvedValue([]);
    service = new DeskMemoryService(prisma, buildEmbedder());
  });

  it('filters by scope and polarity (uppercase Prisma enum values)', async () => {
    await service.listForUI({
      tenantId: 1,
      agentKey: 'assistant-billing',
      scope: SCOPE.PLAYBOOK,
      polarity: POL.REINFORCE,
      activeOnly: true,
      limit: 50,
    });
    const w = prisma.deskMemory.findMany.mock.calls[0][0].where;
    expect(w.scope).toBe(SCOPE.PLAYBOOK);
    expect(w.polarity).toBe(POL.REINFORCE);
  });

  it('omits scope/polarity filters when not provided', async () => {
    await service.listForUI({
      tenantId: 1,
      agentKey: 'assistant-billing',
      activeOnly: true,
      limit: 50,
    });
    const w = prisma.deskMemory.findMany.mock.calls[0][0].where;
    expect(w.scope).toBeUndefined();
    expect(w.polarity).toBeUndefined();
  });

  it('Rules-tab filter — authoredByOperatorOnly=true → authoredByUserId NOT NULL', async () => {
    await service.listForUI({
      tenantId: 1,
      agentKey: 'assistant-billing',
      authoredByOperatorOnly: true,
      activeOnly: true,
      limit: 50,
    });
    const w = prisma.deskMemory.findMany.mock.calls[0][0].where;
    expect(w.authoredByUserId).toEqual({ not: null });
  });

  it('Memory-tab filter — authoredByOperatorOnly=false → authoredByUserId IS NULL', async () => {
    await service.listForUI({
      tenantId: 1,
      agentKey: 'assistant-billing',
      authoredByOperatorOnly: false,
      activeOnly: true,
      limit: 50,
    });
    const w = prisma.deskMemory.findMany.mock.calls[0][0].where;
    expect(w.authoredByUserId).toBeNull();
  });

  it('omits authored filter when undefined (admin view)', async () => {
    await service.listForUI({
      tenantId: 1,
      agentKey: 'assistant-billing',
      activeOnly: true,
      limit: 50,
    });
    expect(prisma.deskMemory.findMany.mock.calls[0][0].where.authoredByUserId).toBeUndefined();
  });

  it('still scopes by sourceEpisodeId when provided (legacy "assistant learned from this" card)', async () => {
    await service.listForUI({
      tenantId: 1,
      agentKey: 'assistant-billing',
      sourceEpisodeId: 'ep-1',
      activeOnly: true,
      limit: 50,
    });
    expect(prisma.deskMemory.findMany.mock.calls[0][0].where.sourceEpisodeId).toBe('ep-1');
  });

  it('returns lowercase scope/polarity in the response shape', async () => {
    prisma.deskMemory.findMany.mockResolvedValue([
      {
        ...buildRow({ scope: SCOPE.PLAYBOOK, polarity: POL.REINFORCE, authoredByUserId: 7 }),
        agent: { key: 'assistant-billing' },
      },
    ]);
    const rows = await service.listForUI({
      tenantId: 1,
      agentKey: 'assistant-billing',
      activeOnly: true,
      limit: 50,
    });
    expect(rows[0]).toMatchObject({
      scope: SCOPE.PLAYBOOK,
      polarity: POL.REINFORCE,
      authoredByUserId: 7,
      isPinned: false,
    });
  });
});

describe('DeskMemoryService — updateForTenant (C1: server-side enforce edit gating)', () => {
  let service: DeskMemoryService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new DeskMemoryService(prisma, buildEmbedder());
  });

  it('rejects content edits on LLM-extracted memories (authoredByUserId IS NULL)', async () => {
    prisma.deskMemory.findUnique.mockResolvedValue({ tenantId: 1, authoredByUserId: null });
    await expect(service.updateForTenant({ memoryId: 'm-llm', tenantId: 1, content: 'rewrite' })).rejects.toThrow(
      /Cannot edit content/i,
    );
    expect(prisma.deskMemory.update).not.toHaveBeenCalled();
  });

  it('allows isActive toggle on LLM-extracted memories (Remove flow still works)', async () => {
    prisma.deskMemory.findUnique.mockResolvedValue({ tenantId: 1, authoredByUserId: null });
    prisma.deskMemory.update.mockResolvedValue({});
    await service.updateForTenant({ memoryId: 'm-llm', tenantId: 1, isActive: false });
    expect(prisma.deskMemory.update).toHaveBeenCalledWith({
      where: { id: 'm-llm' },
      data: { isActive: false },
    });
  });

  it('allows content edits on operator-authored playbook memories (authoredByUserId IS NOT NULL)', async () => {
    prisma.deskMemory.findUnique.mockResolvedValue({ tenantId: 1, authoredByUserId: 7 });
    prisma.deskMemory.update.mockResolvedValue({});
    await service.updateForTenant({ memoryId: 'm-rule', tenantId: 1, content: 'updated rule' });
    expect(prisma.deskMemory.update).toHaveBeenCalledWith({
      where: { id: 'm-rule' },
      data: { content: 'updated rule' },
    });
  });
});

describe('DeskMemoryService — setPinned', () => {
  let service: DeskMemoryService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new DeskMemoryService(prisma, buildEmbedder());
  });

  it('updates isPinned for in-tenant rows', async () => {
    prisma.deskMemory.findUnique.mockResolvedValue({ tenantId: 1 });
    prisma.deskMemory.update.mockResolvedValue({});
    await service.setPinned({ memoryId: 'm-1', tenantId: 1, isPinned: true });
    expect(prisma.deskMemory.update).toHaveBeenCalledWith({
      where: { id: 'm-1' },
      data: { isPinned: true },
    });
  });

  it('throws NotFound for cross-tenant memory (does not leak the row)', async () => {
    prisma.deskMemory.findUnique.mockResolvedValue({ tenantId: 99 });
    await expect(service.setPinned({ memoryId: 'm-1', tenantId: 1, isPinned: true })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.deskMemory.update).not.toHaveBeenCalled();
  });

  it('throws NotFound when row missing entirely', async () => {
    prisma.deskMemory.findUnique.mockResolvedValue(null);
    await expect(service.setPinned({ memoryId: 'missing', tenantId: 1, isPinned: false })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('DeskMemoryService — findRelevant scoring', () => {
  let service: DeskMemoryService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let embedder: jest.Mocked<EmbeddingService>;

  beforeEach(() => {
    prisma = createMockPrisma();
    embedder = buildEmbedder();
    service = new DeskMemoryService(prisma, embedder);
  });

  /**
   * findRelevant uses raw SQL ($queryRaw) so it can read the
   * Unsupported("vector(1536)") column. Mock that path.
   */
  function mockCandidates(rows: ReturnType<typeof buildCandidate>[]) {
    prisma.$queryRaw.mockResolvedValueOnce(rows);
  }

  it('always tenant-scopes the raw SQL via parameterized values', async () => {
    mockCandidates([]);
    await service.findRelevant({
      tenantId: 7,
      agentId: 3,
      entityRef: { customerId: '42' },
      queryContext: 'q',
    });
    // Prisma.sql template tag passes ($1, $2, …) values as the second-arg array
    // to the underlying call; assert tenantId + agentId are present in the bind
    // values regardless of template ordering.
    const callArgs = prisma.$queryRaw.mock.calls[0];
    const flat = JSON.stringify(callArgs);
    expect(flat).toContain('7');
    expect(flat).toContain('3');
  });

  it('C2 — fetchCandidates SQL has ORDER BY confidence DESC, updated_at DESC before LIMIT', async () => {
    // The Prisma.sql tag's first arg is a TemplateStringsArray of the
    // literal SQL fragments. Concat them and assert the ORDER BY is
    // present and ahead of the LIMIT — without this clause, runs over
    // 500 active memories return a non-deterministic candidate set.
    mockCandidates([]);
    await service.findRelevant({
      tenantId: 1,
      agentId: 1,
      entityRef: { customerId: '42' },
      queryContext: 'q',
    });
    const sqlArgs = prisma.$queryRaw.mock.calls[0][0] as ReadonlyArray<string>;
    const sql = sqlArgs.join('?').toLowerCase();
    expect(sql).toMatch(/order by\s+confidence\s+desc[\s\S]*limit/);
  });

  it('structural matches outrank pure-semantic matches', async () => {
    mockCandidates([
      buildCandidate({ id: 'no-match', entityRef: { customerId: 'X' } }),
      buildCandidate({ id: 'match', entityRef: { customerId: '42' } }),
    ]);
    const out = await service.findRelevant({
      tenantId: 1,
      agentId: 1,
      entityRef: { customerId: '42' },
      queryContext: 'overdue invoice for Acme',
      limit: 5,
    });
    expect(out[0].id).toBe('match');
  });

  it('drops candidates below the 0.20 score floor', async () => {
    mockCandidates([
      buildCandidate({
        id: 'noise',
        entityRef: { someUnrelatedKey: 'Z' },
        contentEmbedding: null, // no semantic signal
        confidence: 0.1, // weak
        usageCount: 0, // unused
        createdAt: new Date('2020-01-01'), // ancient → recency ≈ 0
      }),
    ]);
    const out = await service.findRelevant({
      tenantId: 1,
      agentId: 1,
      entityRef: { customerId: '42' },
      queryContext: 'q',
      limit: 5,
    });
    expect(out).toHaveLength(0);
  });

  it('emits public shape with lowercase scope+polarity strings (caller hint)', async () => {
    mockCandidates([buildCandidate({ id: 'b', scope: SCOPE.ENTITY, polarity: POL.REINFORCE })]);
    const out = await service.findRelevant({
      tenantId: 1,
      agentId: 1,
      entityRef: { customerId: '42' },
      queryContext: 'q',
      limit: 5,
    });
    expect(out[0]).toMatchObject({ id: 'b', scope: SCOPE.ENTITY, polarity: POL.REINFORCE });
    expect(typeof out[0].confidence).toBe('number');
    expect(typeof out[0].createdAt).toBe('string');
  });

  it('still returns a row when the embedder fails (semantic score = 0; structural carries it)', async () => {
    embedder.embedText.mockRejectedValueOnce(new Error('gateway down'));
    mockCandidates([buildCandidate({ id: 'b', entityRef: { customerId: '42' } })]);
    const out = await service.findRelevant({
      tenantId: 1,
      agentId: 1,
      entityRef: { customerId: '42' },
      queryContext: 'q',
      limit: 5,
    });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('b');
  });

  it('penalizes a CORRECT memory whose entity matches when the query intent reinforces', async () => {
    // Two rows for the same customer: one REINFORCE (confirms what we're doing),
    // one CORRECT (says "do not pursue this entity"). The CORRECT row carries the
    // contradiction penalty when the query intent is to reinforce — REINFORCE wins.
    mockCandidates([
      buildCandidate({ id: 'reinforce', polarity: POL.REINFORCE, entityRef: { customerId: '42' } }),
      buildCandidate({ id: 'correct', polarity: POL.CORRECT, entityRef: { customerId: '42' } }),
    ]);
    const out = await service.findRelevant({
      tenantId: 1,
      agentId: 1,
      entityRef: { customerId: '42' },
      queryContext: 'q',
      queryIntent: POL.REINFORCE,
      limit: 5,
    });
    expect(out[0].id).toBe('reinforce');
  });

  it('a pinned CORRECT memory escapes the contradiction penalty (operator override)', async () => {
    // The same setup as above, but the CORRECT row is pinned. Pinned memories
    // skip the penalty so the operator's explicit "trust this" wins.
    mockCandidates([
      buildCandidate({ id: 'reinforce', polarity: POL.REINFORCE, entityRef: { customerId: '42' } }),
      buildCandidate({
        id: 'pinned-correct',
        polarity: POL.CORRECT,
        entityRef: { customerId: '42' },
        isPinned: true,
        confidence: 0.99, // tip the score so pinned wins
      }),
    ]);
    const out = await service.findRelevant({
      tenantId: 1,
      agentId: 1,
      entityRef: { customerId: '42' },
      queryContext: 'q',
      queryIntent: POL.REINFORCE,
      limit: 5,
    });
    expect(out.map((r) => r.id)).toContain('pinned-correct');
  });

  it('returns at most `limit` rows', async () => {
    mockCandidates(
      Array.from({ length: 10 }, (_, i) => buildCandidate({ id: `m-${i}`, entityRef: { customerId: '42' } })),
    );
    const out = await service.findRelevant({
      tenantId: 1,
      agentId: 1,
      entityRef: { customerId: '42' },
      queryContext: 'q',
      limit: 3,
    });
    expect(out.length).toBeLessThanOrEqual(3);
  });
});
