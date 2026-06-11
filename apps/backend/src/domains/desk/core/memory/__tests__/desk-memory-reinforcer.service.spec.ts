// Stub PromptingService before any other import — see writer-spec note.
jest.mock('../../../../prompting/prompting.service', () => ({
  PromptingService: class MockPromptingService {},
}));

import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { createMockPrisma } from '../../../../../test/mocks/prisma.mock';

import { DeskMemoryReinforcer } from '../desk-memory-reinforcer.service';

// jest.mock the responsibilities registry so each test injects its own
// (or no) judge without coupling to AR Follow-up's real implementation.
jest.mock('../../../responsibilities', () => ({
  findResponsibilityDefinition: jest.fn(),
}));
import { findResponsibilityDefinition } from '../../../responsibilities';

const findResponsibility = findResponsibilityDefinition as jest.MockedFunction<typeof findResponsibilityDefinition>;

function buildMemoryRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'm-1',
    scope: 'ENTITY',
    polarity: 'REINFORCE',
    content: 'memory',
    entityRef: { customerId: '42' },
    entityPredicate: null,
    confidence: 0.5,
    isPinned: false,
    isActive: true,
    ...overrides,
  };
}

describe('DeskMemoryReinforcer', () => {
  let reinforcer: DeskMemoryReinforcer;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    reinforcer = new DeskMemoryReinforcer(prisma as unknown as PrismaService);
    findResponsibility.mockReset();
  });

  it('CONFIRM → confidence × 1.10 (capped at 0.99) + usageCount++', async () => {
    findResponsibility.mockReturnValue({ reinforcementJudge: () => 'CONFIRM' } as never);
    prisma.deskMemory.findMany.mockResolvedValue([buildMemoryRow({ confidence: 0.5 })]);
    prisma.deskMemory.update.mockResolvedValue({});

    await reinforcer.reinforce({
      retrievedMemoryIds: ['m-1'],
      responsibilityKey: 'welcome',
      transition: 'approve_unchanged',
      entityRef: { customerId: '42' },
      outcome: 'followup_sent',
    });

    expect(prisma.deskMemory.update).toHaveBeenCalledTimes(1);
    const update = prisma.deskMemory.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: 'm-1' });
    expect(update.data.confidence).toBeCloseTo(0.55, 2);
    expect(update.data.usageCount).toEqual({ increment: 1 });
    // Did not touch isActive when above the floor
    expect(update.data.isActive).toBeUndefined();
  });

  it('confidence cap at 0.99 — no overflow', async () => {
    findResponsibility.mockReturnValue({ reinforcementJudge: () => 'CONFIRM' } as never);
    prisma.deskMemory.findMany.mockResolvedValue([buildMemoryRow({ confidence: 0.95 })]);
    prisma.deskMemory.update.mockResolvedValue({});

    await reinforcer.reinforce({
      retrievedMemoryIds: ['m-1'],
      responsibilityKey: 'welcome',
      transition: 'approve_unchanged',
      entityRef: { customerId: '42' },
      outcome: 'followup_sent',
    });

    const data = prisma.deskMemory.update.mock.calls[0][0].data;
    expect(data.confidence).toBeLessThanOrEqual(0.99);
  });

  it('CONTRADICT → confidence × 0.70 + auto-deactivates if confidence < 0.30', async () => {
    findResponsibility.mockReturnValue({ reinforcementJudge: () => 'CONTRADICT' } as never);
    prisma.deskMemory.findMany.mockResolvedValue([buildMemoryRow({ confidence: 0.4 })]);
    prisma.deskMemory.update.mockResolvedValue({});

    await reinforcer.reinforce({
      retrievedMemoryIds: ['m-1'],
      responsibilityKey: 'welcome',
      transition: 'reject',
      entityRef: { customerId: '42' },
      outcome: 'rejected_by_operator',
    });

    const data = prisma.deskMemory.update.mock.calls[0][0].data;
    expect(data.confidence).toBeCloseTo(0.28, 2);
    expect(data.isActive).toBe(false);
  });

  it('CONTRADICT preserves isActive=true when isPinned=true (operator override)', async () => {
    findResponsibility.mockReturnValue({ reinforcementJudge: () => 'CONTRADICT' } as never);
    prisma.deskMemory.findMany.mockResolvedValue([buildMemoryRow({ confidence: 0.4, isPinned: true })]);
    prisma.deskMemory.update.mockResolvedValue({});

    await reinforcer.reinforce({
      retrievedMemoryIds: ['m-1'],
      responsibilityKey: 'welcome',
      transition: 'reject',
      entityRef: { customerId: '42' },
      outcome: 'rejected_by_operator',
    });

    const data = prisma.deskMemory.update.mock.calls[0][0].data;
    expect(data.isActive).toBeUndefined();
  });

  it('NEUTRAL → only bumps usageCount; confidence unchanged', async () => {
    findResponsibility.mockReturnValue({ reinforcementJudge: () => 'NEUTRAL' } as never);
    prisma.deskMemory.findMany.mockResolvedValue([buildMemoryRow({ confidence: 0.5 })]);
    prisma.deskMemory.update.mockResolvedValue({});

    await reinforcer.reinforce({
      retrievedMemoryIds: ['m-1'],
      responsibilityKey: 'welcome',
      transition: 'no_action',
      entityRef: { customerId: '42' },
      outcome: 'no_action_needed',
    });

    const data = prisma.deskMemory.update.mock.calls[0][0].data;
    expect(data.confidence).toBeUndefined();
    expect(data.usageCount).toEqual({ increment: 1 });
  });

  it('no-ops cleanly when responsibility has no reinforcementJudge', async () => {
    findResponsibility.mockReturnValue({} as never);
    prisma.deskMemory.findMany.mockResolvedValue([buildMemoryRow()]);

    await reinforcer.reinforce({
      retrievedMemoryIds: ['m-1'],
      responsibilityKey: 'unknown_responsibility',
      transition: 'approve_unchanged',
      entityRef: { customerId: '42' },
      outcome: 'followup_sent',
    });

    expect(prisma.deskMemory.update).not.toHaveBeenCalled();
  });

  it('no-ops cleanly when responsibility key is unknown', async () => {
    findResponsibility.mockReturnValue(undefined);

    await reinforcer.reinforce({
      retrievedMemoryIds: ['m-1'],
      responsibilityKey: 'no_such_key',
      transition: 'approve_unchanged',
      entityRef: { customerId: '42' },
      outcome: 'followup_sent',
    });

    expect(prisma.deskMemory.findMany).not.toHaveBeenCalled();
  });

  it('no-ops cleanly when retrievedMemoryIds is empty (no extra DB hit)', async () => {
    findResponsibility.mockReturnValue({ reinforcementJudge: () => 'CONFIRM' } as never);

    await reinforcer.reinforce({
      retrievedMemoryIds: [],
      responsibilityKey: 'welcome',
      transition: 'approve_unchanged',
      entityRef: { customerId: '42' },
      outcome: 'followup_sent',
    });

    expect(prisma.deskMemory.findMany).not.toHaveBeenCalled();
    expect(prisma.deskMemory.update).not.toHaveBeenCalled();
  });

  it('walks every retrieved memory in parallel', async () => {
    findResponsibility.mockReturnValue({ reinforcementJudge: () => 'CONFIRM' } as never);
    prisma.deskMemory.findMany.mockResolvedValue([
      buildMemoryRow({ id: 'm-1' }),
      buildMemoryRow({ id: 'm-2' }),
      buildMemoryRow({ id: 'm-3' }),
    ]);
    prisma.deskMemory.update.mockResolvedValue({});

    await reinforcer.reinforce({
      retrievedMemoryIds: ['m-1', 'm-2', 'm-3'],
      responsibilityKey: 'welcome',
      transition: 'approve_unchanged',
      entityRef: { customerId: '42' },
      outcome: 'followup_sent',
    });

    expect(prisma.deskMemory.update).toHaveBeenCalledTimes(3);
  });

  it('skips memories the judge cannot evaluate (entity mismatch returns NEUTRAL → no confidence delta)', async () => {
    // Even with CONFIRM-by-default judge, NEUTRAL prevents any confidence change.
    findResponsibility.mockReturnValue({
      reinforcementJudge: (
        mem: { entityRef: Record<string, unknown> | null },
        ctx: { entityRef: Record<string, unknown> },
      ) => (mem.entityRef?.customerId === ctx.entityRef.customerId ? 'CONFIRM' : 'NEUTRAL'),
    } as never);
    prisma.deskMemory.findMany.mockResolvedValue([
      buildMemoryRow({ id: 'matches', entityRef: { customerId: '42' } }),
      buildMemoryRow({ id: 'mismatched', entityRef: { customerId: '99' } }),
    ]);
    prisma.deskMemory.update.mockResolvedValue({});

    await reinforcer.reinforce({
      retrievedMemoryIds: ['matches', 'mismatched'],
      responsibilityKey: 'welcome',
      transition: 'approve_unchanged',
      entityRef: { customerId: '42' },
      outcome: 'followup_sent',
    });

    const calls = prisma.deskMemory.update.mock.calls;
    const matchedCall = calls.find((c) => c[0].where.id === 'matches')?.[0];
    const mismatchCall = calls.find((c) => c[0].where.id === 'mismatched')?.[0];
    expect(matchedCall?.data.confidence).toBeDefined();
    expect(mismatchCall?.data.confidence).toBeUndefined();
  });
});
