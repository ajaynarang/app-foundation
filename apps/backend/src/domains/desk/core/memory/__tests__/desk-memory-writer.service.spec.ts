// Stub the PromptingService module before any other import — its real
// implementation pulls in Langfuse (ESM), which Jest's runtime can't load
// without --experimental-vm-modules. The writer only uses getPrompt().
jest.mock('../../../../prompting/prompting.service', () => ({
  PromptingService: class MockPromptingService {},
}));

import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { createMockPrisma } from '@appshore/platform/test/mocks/prisma.mock';

import { DeskMemoryWriterService } from '../desk-memory-writer.service';

// Duck-typed mocks — importing the real classes would pull in Langfuse
// (ESM) and trigger Jest's dynamic-import worker error. The writer only
// uses the public surface of each service.
type EmbedderMock = {
  dimensions: number;
  embedText: jest.Mock;
  embedBatch: jest.Mock;
};
type StructuredMock = { extract: jest.Mock };
type PromptingMock = { getPrompt: jest.Mock };

function buildEmbedder(): EmbedderMock {
  return {
    dimensions: 1536,
    embedText: jest.fn().mockResolvedValue(new Array(1536).fill(0)),
    embedBatch: jest.fn(),
  };
}

function buildStructured(extractedContent: string | null = 'Acme rejects reminders before day 40'): StructuredMock {
  return {
    extract: jest.fn().mockResolvedValue({
      object: extractedContent === null ? null : { content: extractedContent },
    }),
  };
}

function buildPrompting(): PromptingMock {
  return {
    getPrompt: jest.fn().mockResolvedValue('extract prompt body'),
  };
}

function buildWriter(
  prisma: ReturnType<typeof createMockPrisma>,
  embedder: EmbedderMock,
  structured: StructuredMock,
  prompting: PromptingMock,
): DeskMemoryWriterService {
  return new DeskMemoryWriterService(prisma, embedder as never, structured as never, prompting as never);
}

describe('DeskMemoryWriterService — close-step write map', () => {
  let writer: DeskMemoryWriterService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let embedder: EmbedderMock;
  let structured: StructuredMock;
  let prompting: PromptingMock;

  beforeEach(() => {
    prisma = createMockPrisma();
    prisma.deskMemory.create.mockResolvedValue({ id: 'm-new' });
    prisma.$queryRaw.mockResolvedValue([]); // no duplicates by default
    prisma.$executeRaw.mockResolvedValue(1);
    embedder = buildEmbedder();
    structured = buildStructured();
    prompting = buildPrompting();
    writer = buildWriter(prisma, embedder, structured, prompting);
  });

  it('approve_unchanged → ENTITY/REINFORCE/0.85 with LLM-extracted content', async () => {
    await writer.write({
      tenantId: 1,
      agentId: 1,
      episodeId: 'ep-1',
      transition: 'approve_unchanged',
      entityRef: { customerId: '42', invoiceNumber: 'INV-1' },
      hydrateContext: '<...>',
      outcome: 'followup_sent',
    });
    expect(prisma.deskMemory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scope: 'ENTITY',
          polarity: 'REINFORCE',
          confidence: 0.85,
          content: 'Acme rejects reminders before day 40',
          sourceEpisodeId: 'ep-1',
        }),
      }),
    );
  });

  it('approve_edited → PATTERN/CORRECT/0.90', async () => {
    await writer.write({
      tenantId: 1,
      agentId: 1,
      episodeId: 'ep-1',
      transition: 'approve_edited',
      entityRef: { customerId: '42', invoiceNumber: 'INV-1' },
      hydrateContext: '<...>',
      outcome: 'followup_sent',
    });
    expect(prisma.deskMemory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scope: 'PATTERN',
          polarity: 'CORRECT',
          confidence: 0.9,
        }),
      }),
    );
  });

  it('reject_and_close → ENTITY/CORRECT/0.95 (entity-scoped hard stop)', async () => {
    await writer.write({
      tenantId: 1,
      agentId: 1,
      episodeId: 'ep-1',
      transition: 'reject_and_close',
      entityRef: { customerId: '42' },
      hydrateContext: '<...>',
      outcome: 'rejected_by_operator',
    });
    expect(prisma.deskMemory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scope: 'ENTITY',
          polarity: 'CORRECT',
          confidence: 0.95,
        }),
      }),
    );
  });

  it('falls back to template content when LLM extract returns null', async () => {
    structured.extract.mockResolvedValueOnce({ object: null });
    await writer.write({
      tenantId: 1,
      agentId: 1,
      episodeId: 'ep-1',
      transition: 'no_action',
      entityRef: { customerId: '42' },
      hydrateContext: '<...>',
      outcome: 'no_action_needed',
    });
    expect(prisma.deskMemory.create).toHaveBeenCalled();
    const createdContent = prisma.deskMemory.create.mock.calls[0][0].data.content;
    expect(createdContent).toMatch(/no_action_needed/i);
    expect(createdContent).toMatch(/customerId/i);
  });

  it('falls back to template when LLM extract throws', async () => {
    structured.extract.mockRejectedValueOnce(new Error('gateway down'));
    const result = await writer.write({
      tenantId: 1,
      agentId: 1,
      episodeId: 'ep-1',
      transition: 'approve_unchanged',
      entityRef: { customerId: '42' },
      hydrateContext: '<...>',
      outcome: 'followup_sent',
    });
    expect(result).not.toBeNull();
    expect(prisma.deskMemory.create).toHaveBeenCalled();
  });

  it('skips write entirely when the transition is not in the write map (e.g. tool_error)', async () => {
    const result = await writer.write({
      tenantId: 1,
      agentId: 1,
      episodeId: 'ep-1',
      transition: 'tool_error' as never,
      entityRef: { customerId: '42' },
      hydrateContext: '<...>',
      outcome: 'failed',
    });
    expect(result).toBeNull();
    expect(prisma.deskMemory.create).not.toHaveBeenCalled();
    expect(structured.extract).not.toHaveBeenCalled();
  });

  it('dedups against an existing memory above cosine 0.92 (bumps usageCount instead of creating)', async () => {
    // Mock the dedup raw query to return an identical-embedding row.
    prisma.$queryRaw.mockResolvedValueOnce([{ id: 'm-existing', similarity: 0.99 }]);
    prisma.deskMemory.update.mockResolvedValue({ id: 'm-existing' });

    const result = await writer.write({
      tenantId: 1,
      agentId: 1,
      episodeId: 'ep-2',
      transition: 'approve_unchanged',
      entityRef: { customerId: '42' },
      hydrateContext: '<...>',
      outcome: 'followup_sent',
    });

    expect(result).toEqual({ id: 'm-existing', deduplicated: true });
    expect(prisma.deskMemory.create).not.toHaveBeenCalled();
    expect(prisma.deskMemory.update).toHaveBeenCalledWith({
      where: { id: 'm-existing' },
      data: { usageCount: { increment: 1 } },
    });
  });

  it('prefers per-responsibility prompt when present, else falls back to default', async () => {
    await writer.write({
      tenantId: 1,
      agentId: 1,
      episodeId: 'ep-1',
      transition: 'approve_unchanged',
      entityRef: { customerId: '42' },
      hydrateContext: '<...>',
      outcome: 'followup_sent',
      responsibilityKey: 'welcome',
    });
    // The first call should be the per-responsibility name; second fallback to default.
    const calls = prompting.getPrompt.mock.calls.map((c) => c[0]);
    expect(calls[0]).toBe('desk.memory.extract.welcome.v1');
  });

  it('I2 — findDuplicate query carries the expires_at filter', async () => {
    // Force the dedup path to fire so we capture its $queryRaw call.
    prisma.$queryRaw.mockResolvedValueOnce([]); // findDuplicate finds nothing
    prisma.$queryRaw.mockResolvedValueOnce([]); // enforcePerEntityCap
    await writer.write({
      tenantId: 1,
      agentId: 1,
      episodeId: 'ep-1',
      transition: 'approve_unchanged',
      entityRef: { customerId: '42' },
      hydrateContext: '<...>',
      outcome: 'followup_sent',
    });
    const dedupCall = prisma.$queryRaw.mock.calls[0][0] as ReadonlyArray<string>;
    const sql = dedupCall.join('?').toLowerCase();
    expect(sql).toContain('expires_at');
    expect(sql).toContain('content_embedding is not null');
  });

  it('C3 — per-entity cap evicts the lowest-confidence non-pinned row before insert', async () => {
    // findDuplicate → no match
    prisma.$queryRaw.mockResolvedValueOnce([]);
    // enforcePerEntityCap → 30 active eligible rows; first one is the eviction target.
    const fillerRows = Array.from({ length: 30 }, (_, i) => ({
      id: `m-${i}`,
      confidence: i === 0 ? 0.2 : 0.5 + i * 0.01,
    }));
    prisma.$queryRaw.mockResolvedValueOnce(fillerRows);
    prisma.deskMemory.update.mockResolvedValue({});

    await writer.write({
      tenantId: 1,
      agentId: 1,
      episodeId: 'ep-new',
      transition: 'approve_unchanged',
      entityRef: { customerId: '42' },
      hydrateContext: '<...>',
      outcome: 'followup_sent',
    });

    // Eviction soft-deletes the lowest-confidence row (m-0) BEFORE the create.
    expect(prisma.deskMemory.update).toHaveBeenCalledWith({
      where: { id: 'm-0' },
      data: { isActive: false },
    });
    expect(prisma.deskMemory.create).toHaveBeenCalled();
  });

  it('C3 — per-entity cap is a no-op below the ceiling', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([]); // findDuplicate
    prisma.$queryRaw.mockResolvedValueOnce(Array.from({ length: 5 }, (_, i) => ({ id: `m-${i}`, confidence: 0.5 })));
    await writer.write({
      tenantId: 1,
      agentId: 1,
      episodeId: 'ep-1',
      transition: 'approve_unchanged',
      entityRef: { customerId: '42' },
      hydrateContext: '<...>',
      outcome: 'followup_sent',
    });
    // create was called for the new row; no eviction update.
    expect(prisma.deskMemory.create).toHaveBeenCalled();
    expect(prisma.deskMemory.update).not.toHaveBeenCalled();
  });
});

describe('DeskMemoryWriterService — writeOperatorRule (Rules tab "Add a rule")', () => {
  let writer: DeskMemoryWriterService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let embedder: EmbedderMock;
  let structured: StructuredMock;

  beforeEach(() => {
    prisma = createMockPrisma();
    prisma.deskMemory.create.mockResolvedValue({ id: 'm-new' });
    prisma.$executeRaw.mockResolvedValue(1);
    embedder = buildEmbedder();
    structured = buildStructured();
    writer = buildWriter(prisma, embedder, structured, buildPrompting());
  });

  it('writes PLAYBOOK/REINFORCE/0.85 with verbatim content (no LLM extract) + sets authoredByUserId', async () => {
    await writer.writeOperatorRule({
      tenantId: 1,
      agentId: 1,
      authoredByUserId: 7,
      content: 'Escalate invoices > $10k to Bill before Friday',
    });
    expect(structured.extract).not.toHaveBeenCalled();
    const createArgs = prisma.deskMemory.create.mock.calls[0][0];
    expect(createArgs.data).toMatchObject({
      scope: 'PLAYBOOK',
      polarity: 'REINFORCE',
      confidence: 0.85,
      content: 'Escalate invoices > $10k to Bill before Friday',
      authoredByUserId: 7,
      sourceEpisodeId: null,
    });
    // entityRef + entityPredicate use Prisma.JsonNull (a sentinel object,
    // serializes as `null` in Postgres). Assert via the sentinel marker
    // shape rather than equality with `null`.
    expect(createArgs.data.entityRef).toBeDefined();
    // Embedding still happens so semantic retrieval works on the rule.
    // AI cost telemetry context added in PR 4 — agentId becomes the
    // second arg with surface=MEMORY_EXTRACT.
    expect(embedder.embedText).toHaveBeenCalledWith(
      'Escalate invoices > $10k to Bill before Friday',
      expect.objectContaining({ surface: 'MEMORY_EXTRACT', tenantId: expect.any(Number) }),
    );
  });
});
