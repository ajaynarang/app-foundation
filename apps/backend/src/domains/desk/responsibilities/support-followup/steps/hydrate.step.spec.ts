const nestGet = jest.fn();
jest.mock('../../../core/inngest/nest-context', () => ({ nestApp: () => ({ get: nestGet }) }));

import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { DeskStepWriter } from '../../../core/episode/desk-step-writer.service';
import { DeskMemoryService } from '../../../core/memory/desk-memory.service';
import { hydrateStep } from './hydrate.step';

const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY - 60_000);

function setup(
  overrides: { ticket?: Record<string, unknown> | null; episode?: Record<string, unknown>; memories?: unknown[] } = {},
) {
  const prisma = {
    deskEpisode: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 'e1',
        tenantId: 10,
        ownerAgentId: 4,
        responsibilityId: 3,
        entityType: 'support_ticket',
        entityId: 'ST-1001',
        conditionsSnapshot: { staleAfterDays: 3 },
        ...overrides.episode,
      }),
      count: jest.fn().mockResolvedValue(2),
      update: jest.fn().mockResolvedValue({}),
    },
    supportTicket: {
      findFirst: jest.fn().mockResolvedValue(
        overrides.ticket === null
          ? null
          : {
              ticketNumber: 'ST-1001',
              subject: 'Export to CSV fails',
              description: 'd'.repeat(5_000),
              category: 'TECHNICAL',
              priority: 'MEDIUM',
              status: 'OPEN',
              createdAt: ago(9),
              // Newest first, as the query asks.
              messages: [
                { authorRole: 'user', content: 'Any news?', createdAt: ago(5) },
                { authorRole: 'admin', content: 'Looking into it.', createdAt: ago(7) },
              ],
              ...overrides.ticket,
            },
      ),
    },
  };
  const stepWriter = {
    open: jest.fn().mockResolvedValue({ id: 'step-1' }),
    succeeded: jest.fn().mockResolvedValue(undefined),
    failed: jest.fn().mockResolvedValue(undefined),
  };
  const memory = { findRelevant: jest.fn().mockResolvedValue(overrides.memories ?? []) };
  nestGet.mockImplementation((token: unknown) => {
    if (token === PrismaService) return prisma;
    if (token === DeskStepWriter) return stepWriter;
    if (token === DeskMemoryService) return memory;
    throw new Error('unexpected provider');
  });
  return { prisma, stepWriter, memory };
}

describe('support follow-up: hydrate', () => {
  it('loads the ticket by tenant and number, without internal notes, oldest reply first', async () => {
    const { prisma, stepWriter } = setup();
    const out = await hydrateStep({ episodeId: 'e1' });

    const query = prisma.supportTicket.findFirst.mock.calls[0][0];
    expect(query.where).toEqual({ tenantId: 10, ticketNumber: 'ST-1001' });
    expect(query.select.messages.where).toEqual({ isInternal: false });

    expect(out.entity.ticket).toMatchObject({
      ticketNumber: 'ST-1001',
      priority: 'MEDIUM',
      status: 'OPEN',
      daysQuiet: 5,
    });
    expect(out.entity.ticket.description).toHaveLength(2_000);
    expect(out.entity.thread.map((m) => m.content)).toEqual(['Looking into it.', 'Any news?']);
    expect(out.preflight).toEqual({ action: 'proceed' });
    expect(out.relationshipRef).toEqual({ supportCategory: 'TECHNICAL' });
    expect(stepWriter.succeeded).toHaveBeenCalledWith({ stepId: 'step-1', output: out });
  });

  it('counts the follow-ups this job already sent on this ticket, in this tenant', async () => {
    const { prisma } = setup();
    const out = await hydrateStep({ episodeId: 'e1' });

    expect(out.entity.priorFollowUpCount).toBe(2);
    expect(prisma.deskEpisode.count).toHaveBeenCalledWith({
      where: {
        tenantId: 10,
        responsibilityId: 3,
        entityType: 'support_ticket',
        entityId: 'ST-1001',
        outcome: 'followup_sent',
      },
    });
  });

  it('counts quiet days from the opening when nobody has replied', async () => {
    setup({ ticket: { messages: [] } });
    const out = await hydrateStep({ episodeId: 'e1' });
    expect(out.entity.ticket.daysQuiet).toBe(9);
    expect(out.entity.thread).toEqual([]);
  });

  it('records the memories it used on the episode, and writes nothing when there are none', async () => {
    const memories = [
      { id: 'm1', scope: 'PATTERN', polarity: 'REINFORCE', content: 'x', confidence: 0.7, createdAt: 'now' },
    ];
    const used = setup({ memories });
    await hydrateStep({ episodeId: 'e1' });
    expect(used.prisma.deskEpisode.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: { retrievedMemoryIds: ['m1'] },
    });
    expect(used.memory.findRelevant.mock.calls[0][0]).toMatchObject({
      tenantId: 10,
      agentId: 4,
      entityRef: { ticketNumber: 'ST-1001', supportCategory: 'TECHNICAL' },
    });

    const none = setup();
    await hydrateStep({ episodeId: 'e1' });
    expect(none.prisma.deskEpisode.update).not.toHaveBeenCalled();
  });

  it('says abort for a ticket that was resolved, and skip for one that got a reply', async () => {
    setup({ ticket: { status: 'RESOLVED' } });
    expect((await hydrateStep({ episodeId: 'e1' })).preflight.action).toBe('abort');

    setup({ ticket: { messages: [{ authorRole: 'admin', content: 'Fixed.', createdAt: ago(1) }] } });
    expect((await hydrateStep({ episodeId: 'e1' })).preflight.action).toBe('skip');
  });

  it('uses the default wait when the episode carries no conditions', async () => {
    setup({
      episode: { conditionsSnapshot: null },
      ticket: { messages: [{ authorRole: 'user', content: 'x', createdAt: ago(3) }] },
    });
    expect((await hydrateStep({ episodeId: 'e1' })).preflight.action).toBe('proceed');
  });

  it('fails the step when the ticket is gone or the episode is about something else', async () => {
    const gone = setup({ ticket: null });
    await expect(hydrateStep({ episodeId: 'e1' })).rejects.toThrow('ticket ST-1001 not found');
    expect(gone.stepWriter.failed).toHaveBeenCalledWith({
      stepId: 'step-1',
      errorMessage: 'hydrate: ticket ST-1001 not found',
    });

    const wrong = setup({ episode: { entityType: 'invoice' } });
    await expect(hydrateStep({ episodeId: 'e1' })).rejects.toThrow('needs entityType=support_ticket');
    expect(wrong.prisma.supportTicket.findFirst).not.toHaveBeenCalled();
  });
});
