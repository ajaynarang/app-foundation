import type { Prisma } from '@appshore/db';

import { createMockPrisma } from '@appshore/platform/test/mocks/prisma.mock';
import { createMockOutbox } from '@appshore/platform/test/mocks/outbox.mock';
import { DOMAIN_EVENTS } from '../../../../platform-glue/events/domain-events.constants';

import { TriggerService } from './trigger.service';

/**
 * Unit coverage for the generic TriggerService engine and the reference job's
 * run method. When you add a responsibility, add a `run<X>ForTenant` method
 * (using the shared `upsertEpisode` building block) and a matching `runByKey`
 * case, then cover it here the same way.
 */

function makeInngest() {
  return { send: jest.fn().mockResolvedValue(undefined) } as const;
}

/** The outbox; `emit` records what it published once its transaction committed. */
function makeEvents(prisma: ReturnType<typeof createMockPrisma> = createMockPrisma()) {
  return createMockOutbox(prisma);
}

/** Exposes the protected `upsertEpisode` building block for direct coverage. */
class TestTriggerService extends TriggerService {
  upsert(input: Parameters<TriggerService['upsertEpisode']>[0]) {
    return this.upsertEpisode(input);
  }
}

const UPSERT_INPUT: Parameters<TestTriggerService['upsert']>[0] = {
  tenantId: 10,
  responsibilityKey: 'welcome',
  entityType: 'invoice',
  entityId: 'inv_1',
  entityLabel: 'INV-1',
  responsibilityId: 3,
  ownerAgentId: 4,
  trustLevelSnapshot: 'SUPERVISED',
  conditionsSnapshot: {},
  trigger: { kind: 'SCHEDULED', label: 'Nightly', source: 'cron', firedAt: new Date('2026-10-09T00:00:00Z') },
  dedupeKey: 'welcome:inv_1',
};

describe('TriggerService', () => {
  describe('runSupportFollowupForTenant — the reference job', () => {
    const NOW = new Date('2026-11-16T12:00:00Z');
    const RESPONSIBILITY = {
      id: 3,
      agentId: 4,
      enabled: true,
      lifecycle: 'AVAILABLE',
      trustLevel: 'ASSISTED',
      conditions: { staleAfterDays: 5 },
      agent: { supervisorUserId: 99 },
    };
    const ticket = (ticketNumber: string) => ({
      ticketNumber,
      subject: `Subject of ${ticketNumber}`,
      priority: 'MEDIUM',
      createdAt: new Date('2026-11-01T12:00:00Z'),
      messages: [],
    });

    function setup(responsibility: unknown = RESPONSIBILITY) {
      const prisma = createMockPrisma();
      const inngest = makeInngest();
      prisma.deskResponsibility.findUnique.mockResolvedValue(responsibility);
      prisma.supportTicket.findMany.mockResolvedValue([ticket('ST-1'), ticket('ST-2'), ticket('ST-3')]);
      prisma.deskEntitySuppression.findFirst.mockResolvedValue(null);
      prisma.deskEpisode.findFirst.mockResolvedValue(null);
      prisma.deskEpisode.create.mockImplementation(async ({ data }: { data: { entityId: string } }) => ({
        id: `ep-${data.entityId}`,
      }));
      const svc = new TriggerService(prisma, inngest as never, makeEvents(prisma) as never);
      return { prisma, inngest, svc };
    }

    beforeEach(() => jest.useFakeTimers().setSystemTime(NOW));
    afterEach(() => jest.useRealTimers());

    it('opens one episode per quiet ticket and sends one run event each, keyed by ticket and day', async () => {
      const { prisma, inngest, svc } = setup();

      await expect(svc.runByKey('support_followup', 10)).resolves.toEqual({ episodesOpened: 3, episodesReused: 0 });

      expect(prisma.deskResponsibility.findUnique.mock.calls[0][0].where).toEqual({
        tenantId_key: { tenantId: 10, key: 'support_followup' },
      });
      // The operator's own wait (5 days) picks the tickets.
      expect(prisma.supportTicket.findMany.mock.calls[0][0].where).toMatchObject({
        tenantId: 10,
        createdAt: { lte: new Date('2026-11-11T12:00:00Z') },
      });
      expect(prisma.deskEpisode.create.mock.calls[0][0].data).toMatchObject({
        tenantId: 10,
        responsibilityId: 3,
        ownerAgentId: 4,
        trustLevelSnapshot: 'ASSISTED',
        conditionsSnapshot: { staleAfterDays: 5 },
        entityType: 'support_ticket',
        entityId: 'ST-1',
        entityLabel: 'ST-1 · Subject of ST-1 · quiet 15d',
        dedupeKey: 'support_followup:support_ticket:ST-1',
      });
      expect(inngest.send).toHaveBeenCalledTimes(3);
      expect(inngest.send).toHaveBeenCalledWith(
        'app/desk.support_followup.run',
        {
          episodeId: 'ep-ST-1',
          tenantId: 10,
          ticketNumber: 'ST-1',
          idempotencyKey: 'support_followup:support_ticket:ST-1:2026-11-16',
        },
        { id: 'support_followup:support_ticket:ST-1:2026-11-16' },
      );
    });

    it('reuses an open episode, and sends nothing for a suppressed ticket', async () => {
      const { prisma, inngest, svc } = setup();
      prisma.deskEpisode.findFirst.mockResolvedValueOnce({ id: 'ep-open' }).mockResolvedValue(null);
      prisma.deskEntitySuppression.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'sup-1', suppressUntil: null })
        .mockResolvedValue(null);

      await expect(svc.runSupportFollowupForTenant(10)).resolves.toEqual({ episodesOpened: 1, episodesReused: 1 });
      expect(inngest.send.mock.calls.map(([, data]) => data.ticketNumber)).toEqual(['ST-1', 'ST-3']);
    });

    it.each([
      ['responsibility_not_seeded', null],
      ['disabled', { ...RESPONSIBILITY, enabled: false }],
      ['not_available', { ...RESPONSIBILITY, lifecycle: 'COMING_SOON' }],
      ['no_supervisor', { ...RESPONSIBILITY, agent: { supervisorUserId: null } }],
    ])('does nothing and says %s', async (skipped, responsibility) => {
      const { prisma, inngest, svc } = setup(responsibility);

      await expect(svc.runSupportFollowupForTenant(10)).resolves.toEqual({ episodesOpened: 0, skipped });
      expect(prisma.supportTicket.findMany).not.toHaveBeenCalled();
      expect(inngest.send).not.toHaveBeenCalled();
    });

    it('opens nothing when no ticket is quiet', async () => {
      const { prisma, inngest, svc } = setup();
      prisma.supportTicket.findMany.mockResolvedValue([]);
      await expect(svc.runSupportFollowupForTenant(10)).resolves.toEqual({ episodesOpened: 0, episodesReused: 0 });
      expect(inngest.send).not.toHaveBeenCalled();
    });
  });

  describe('runByKey — generic dispatch', () => {
    it('fail-closes for a key with no run method with a BadRequestException', async () => {
      const prisma = createMockPrisma();
      const svc = new TriggerService(prisma, makeInngest() as never, makeEvents() as never);

      await expect(svc.runByKey('anything', 10)).rejects.toThrow(/No run method wired/);
      // Nothing was dispatched — no DB read, no episode opened.
      expect(prisma.deskResponsibility.findUnique).not.toHaveBeenCalled();
      expect(prisma.deskEpisode.create).not.toHaveBeenCalled();
    });
  });

  describe('upsertEpisode', () => {
    function setup() {
      const prisma = createMockPrisma();
      const events = makeEvents(prisma);
      prisma.deskEntitySuppression.findFirst.mockResolvedValue(null);
      prisma.deskEpisode.findFirst.mockResolvedValue(null);
      prisma.deskEpisode.create.mockResolvedValue({ id: 'ep-new' });
      const svc = new TestTriggerService(prisma, makeInngest() as never, events as never);
      return { prisma, events, svc };
    }

    it('opens a RUNNING episode and publishes DESK_EPISODE_CHANGED with it', async () => {
      const { prisma, events, svc } = setup();
      await expect(svc.upsert(UPSERT_INPUT)).resolves.toEqual({ id: 'ep-new', isNew: true });
      expect(prisma.deskEpisode.create).toHaveBeenCalledTimes(1);
      expect(events.emit).toHaveBeenCalledWith(DOMAIN_EVENTS.DESK_EPISODE_CHANGED, 10, {
        tenantId: 10,
        episodeId: 'ep-new',
        status: 'RUNNING',
      });
    });

    it('reuses an open episode without publishing', async () => {
      const { prisma, events, svc } = setup();
      prisma.deskEpisode.findFirst.mockResolvedValue({ id: 'ep-open' });
      await expect(svc.upsert(UPSERT_INPUT)).resolves.toEqual({ id: 'ep-open', isNew: false });
      expect(prisma.deskEpisode.create).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('skips a suppressed entity without opening or publishing', async () => {
      const { prisma, events, svc } = setup();
      prisma.deskEntitySuppression.findFirst.mockResolvedValue({ id: 'sup-1', suppressUntil: null });
      await expect(svc.upsert(UPSERT_INPUT)).resolves.toEqual({ skipped: 'suppressed', suppressionId: 'sup-1' });
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('publishes nothing when the episode write fails', async () => {
      const { prisma, events, svc } = setup();
      prisma.deskEpisode.create.mockRejectedValue(new Error('unique violation'));
      await expect(svc.upsert(UPSERT_INPUT)).rejects.toThrow('unique violation');
      expect(events.emit).not.toHaveBeenCalled();
    });
  });

  // Keep a Prisma type import referenced so the file doesn't lose its
  // dependency if someone trims imports during a refactor (trigger.service
  // signature narrows on `Prisma.InputJsonValue`).
  it('module imports Prisma types', () => {
    const _typeRef: Prisma.InputJsonValue = {};
    expect(_typeRef).toBeDefined();
  });
});
