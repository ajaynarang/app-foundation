import type { Prisma } from '@appshore/db';

import { createMockPrisma } from '@appshore/platform/test/mocks/prisma.mock';
import { createMockOutbox } from '@appshore/platform/test/mocks/outbox.mock';
import { DOMAIN_EVENTS } from '../../../../platform-glue/events/domain-events.constants';

import { TriggerService } from './trigger.service';

/**
 * Unit coverage for the generic TriggerService engine. The starter ships an
 * EMPTY responsibility registry, so `runByKey` fail-closes on every key. When
 * you add a responsibility, add a `run<X>ForTenant` method (using the shared
 * `upsertEpisode` building block) and a matching `runByKey` case, then cover it
 * here.
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
  describe('runByKey — generic dispatch (empty registry)', () => {
    it('fail-closes for any key with a BadRequestException', async () => {
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
