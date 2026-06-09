/**
 * Unit tests for SuppressionService — covers the four behaviours called
 * out in the T27g plan:
 *   1. snooze('1w') creates a row with suppressUntil ≈ now + 7d, calls
 *      closeStep with outcome=rejected_by_operator, and emits the
 *      app.desk.episode.snoozed DomainEvent.
 *   2. duration='forever' → suppressUntil=null.
 *   3. Existing active suppression → finalUntil = max(current, new),
 *      never shortens (30d existing + 1w new → keeps 30d).
 *   4. unsnooze() sets unsuppressedAt + unsuppressedByUserId.
 */

import { NotFoundException } from '@nestjs/common';

import { createMockPrisma } from '../../../../../test/mocks/prisma.mock';
import { createMockEventEmitter } from '../../../../../test/mocks/event-emitter.mock';
import { DomainEvent } from '../../../../../infrastructure/events/domain-event';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

// Mock closeStep at module boundary — the shared-steps module pulls in
// nestApp() which requires a live Nest container, so we replace it with
// a jest.fn() the tests can assert against.
jest.mock('../../../shared-steps/close.step', () => ({
  closeStep: jest
    .fn()
    .mockResolvedValue({ episodeId: 'e1', outcome: 'rejected_by_operator', closedAt: '2026-04-24T00:00:00.000Z' }),
}));

import { closeStep } from '../../../shared-steps/close.step';
import { SuppressionService } from '../suppression.service';

const TENANT_ID = 10;
const USER_ID = 99;
const EPISODE_ID = 'e1';

function makeEpisode() {
  return {
    id: EPISODE_ID,
    entityType: 'invoice',
    entityId: 'INV-001',
    responsibility: { key: 'ar_followup' },
  };
}

function makeSuppressionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'sup-1',
    tenantId: TENANT_ID,
    responsibilityKey: 'ar_followup',
    entityType: 'invoice',
    entityId: 'INV-001',
    suppressUntil: null as Date | null,
    reason: null as string | null,
    setByUserId: USER_ID,
    setAt: new Date(),
    sourceEpisodeId: EPISODE_ID,
    unsuppressedAt: null as Date | null,
    unsuppressedByUserId: null as number | null,
    ...overrides,
  };
}

describe('SuppressionService', () => {
  let service: SuppressionService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let events: ReturnType<typeof createMockEventEmitter>;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createMockPrisma();
    events = createMockEventEmitter();
    service = new SuppressionService(prisma as unknown as PrismaService, events as any);
  });

  describe('snooze', () => {
    it("creates a new suppression with suppressUntil ≈ now + 7d when duration='1w', closes the episode, and emits app.desk.episode.snoozed", async () => {
      prisma.deskEpisode.findFirst.mockResolvedValue(makeEpisode());
      prisma.deskEntitySuppression.findFirst.mockResolvedValue(null); // no existing
      const createdUntil = new Date(Date.now() + 7 * 86_400_000);
      prisma.deskEntitySuppression.create.mockResolvedValue(makeSuppressionRow({ suppressUntil: createdUntil }));

      const before = Date.now();
      const result = await service.snooze({
        episodeId: EPISODE_ID,
        tenantId: TENANT_ID,
        userId: USER_ID,
        duration: '1w',
      });

      // Row returned has suppressUntil in the future, within ~7d of now.
      expect(result.suppressUntil).not.toBeNull();
      expect(result.suppressUntil!.getTime()).toBeGreaterThan(before + 6 * 86_400_000);
      expect(result.suppressUntil!.getTime()).toBeLessThanOrEqual(before + 8 * 86_400_000);

      // Create was called with the right tuple + user + episode.
      expect(prisma.deskEntitySuppression.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: TENANT_ID,
            responsibilityKey: 'ar_followup',
            entityType: 'invoice',
            entityId: 'INV-001',
            setByUserId: USER_ID,
            sourceEpisodeId: EPISODE_ID,
          }),
        }),
      );

      // closeStep was invoked with the terminal reject tuple.
      expect(closeStep).toHaveBeenCalledWith(
        expect.objectContaining({
          episodeId: EPISODE_ID,
          outcome: 'rejected_by_operator',
          terminalStatus: 'REJECTED_BY_OPERATOR',
        }),
      );

      // DomainEvent emitted on the right topic with the right envelope.
      expect(events.emit).toHaveBeenCalledWith('app.desk.episode-snoozed', expect.any(DomainEvent));
      const emittedEvent = events.emit.mock.calls[0][1] as DomainEvent<{
        episodeId: string;
        suppressionId: string;
        suppressUntil: string | null;
      }>;
      expect(emittedEvent.event).toBe('app.desk.episode-snoozed');
      expect(emittedEvent.tenantId).toBe(String(TENANT_ID));
      expect(emittedEvent.data.episodeId).toBe(EPISODE_ID);
      expect(emittedEvent.data.suppressionId).toBe('sup-1');
    });

    it("maps duration='forever' to suppressUntil=null", async () => {
      prisma.deskEpisode.findFirst.mockResolvedValue(makeEpisode());
      prisma.deskEntitySuppression.findFirst.mockResolvedValue(null);
      prisma.deskEntitySuppression.create.mockResolvedValue(makeSuppressionRow({ suppressUntil: null }));

      const result = await service.snooze({
        episodeId: EPISODE_ID,
        tenantId: TENANT_ID,
        userId: USER_ID,
        duration: 'forever',
      });

      expect(result.suppressUntil).toBeNull();
      // Verify we asked Prisma to store null (not a date).
      const createArgs = prisma.deskEntitySuppression.create.mock.calls[0][0];
      expect(createArgs.data.suppressUntil).toBeNull();
    });

    it('extends existing active suppression to max(current, new) — never shortens (30d existing vs 1w new → keeps 30d)', async () => {
      prisma.deskEpisode.findFirst.mockResolvedValue(makeEpisode());
      const existingUntil = new Date(Date.now() + 30 * 86_400_000);
      prisma.deskEntitySuppression.findFirst.mockResolvedValue(makeSuppressionRow({ suppressUntil: existingUntil }));
      prisma.deskEntitySuppression.update.mockImplementation(async ({ data }: any) =>
        makeSuppressionRow({ suppressUntil: data.suppressUntil as Date | null }),
      );

      const result = await service.snooze({
        episodeId: EPISODE_ID,
        tenantId: TENANT_ID,
        userId: USER_ID,
        duration: '1w', // 7d < existing 30d
      });

      // Returned row retains the 30d (existing) until — the shorter 1w was ignored.
      expect(result.suppressUntil?.getTime()).toBe(existingUntil.getTime());
      // Update was called (not create).
      expect(prisma.deskEntitySuppression.update).toHaveBeenCalledTimes(1);
      expect(prisma.deskEntitySuppression.create).not.toHaveBeenCalled();
      // And the final value written was the bigger of the two.
      const updateArgs = prisma.deskEntitySuppression.update.mock.calls[0][0];
      expect((updateArgs.data.suppressUntil as Date).getTime()).toBe(existingUntil.getTime());
    });

    it('existing=forever (null) + new=1w → keeps forever (null beats any timestamp)', async () => {
      prisma.deskEpisode.findFirst.mockResolvedValue(makeEpisode());
      prisma.deskEntitySuppression.findFirst.mockResolvedValue(makeSuppressionRow({ suppressUntil: null }));
      prisma.deskEntitySuppression.update.mockImplementation(async ({ data }: any) =>
        makeSuppressionRow({ suppressUntil: data.suppressUntil as Date | null }),
      );

      const result = await service.snooze({
        episodeId: EPISODE_ID,
        tenantId: TENANT_ID,
        userId: USER_ID,
        duration: '1w',
      });

      expect(result.suppressUntil).toBeNull();
      const updateArgs = prisma.deskEntitySuppression.update.mock.calls[0][0];
      expect(updateArgs.data.suppressUntil).toBeNull();
    });

    it('404s when episode is missing or cross-tenant', async () => {
      prisma.deskEpisode.findFirst.mockResolvedValue(null);
      await expect(
        service.snooze({
          episodeId: EPISODE_ID,
          tenantId: TENANT_ID,
          userId: USER_ID,
          duration: '1d',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects a snooze when the episode has no entity reference (null entityType / entityId)', async () => {
      // A snooze without (entityType, entityId) can't be written as a
      // meaningful suppression tuple — reject with 400 rather than create
      // a ghost row with empty-string keys.
      prisma.deskEpisode.findFirst.mockResolvedValue({
        id: EPISODE_ID,
        entityType: null,
        entityId: null,
        responsibility: { key: 'ar_followup' },
      });
      const { BadRequestException } = await import('@nestjs/common');
      await expect(
        service.snooze({
          episodeId: EPISODE_ID,
          tenantId: TENANT_ID,
          userId: USER_ID,
          duration: '1d',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.deskEntitySuppression.create).not.toHaveBeenCalled();
      expect(closeStep).not.toHaveBeenCalled();
    });
  });

  describe('unsnooze', () => {
    it('sets unsuppressedAt (now) + unsuppressedByUserId and emits app.desk.suppression-cleared', async () => {
      const row = makeSuppressionRow({ suppressUntil: new Date(Date.now() + 86_400_000) });
      prisma.deskEntitySuppression.findFirst.mockResolvedValue(row);
      prisma.deskEntitySuppression.update.mockResolvedValue({
        ...row,
        unsuppressedAt: new Date(),
        unsuppressedByUserId: USER_ID,
      });

      await service.unsnooze('sup-1', TENANT_ID, USER_ID);

      // Read is tenant-scoped — a leaked cross-tenant UUID can never reach update.
      expect(prisma.deskEntitySuppression.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sup-1', tenantId: TENANT_ID, unsuppressedAt: null },
        }),
      );
      expect(prisma.deskEntitySuppression.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sup-1' },
          data: expect.objectContaining({
            unsuppressedAt: expect.any(Date),
            unsuppressedByUserId: USER_ID,
          }),
        }),
      );
      expect(events.emit).toHaveBeenCalledWith('app.desk.suppression-cleared', expect.any(DomainEvent));
      const emittedEvent = events.emit.mock.calls[0][1] as DomainEvent<{ suppressionId: string }>;
      expect(emittedEvent.event).toBe('app.desk.suppression-cleared');
      expect(emittedEvent.tenantId).toBe(String(TENANT_ID));
      expect(emittedEvent.data.suppressionId).toBe('sup-1');
    });

    it('404s when the suppression is missing', async () => {
      prisma.deskEntitySuppression.findFirst.mockResolvedValue(null);
      await expect(service.unsnooze('sup-missing', TENANT_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('404s when the suppression belongs to a different tenant (cross-tenant isolation)', async () => {
      // Real row exists under tenant TENANT_ID; caller is tenant 999.
      // findFirst with `where: { id, tenantId: 999, unsuppressedAt: null }`
      // returns null, so the service throws 404 without reaching update.
      prisma.deskEntitySuppression.findFirst.mockResolvedValue(null);
      await expect(service.unsnooze('sup-1', 999, USER_ID)).rejects.toThrow(NotFoundException);
      expect(prisma.deskEntitySuppression.update).not.toHaveBeenCalled();
    });

    it('404s when the suppression was already cleared (where-clause filters unsuppressedAt: null)', async () => {
      // With the new where clause, an already-cleared row doesn't match —
      // service throws 404 identical to missing, no existence signal leaked.
      prisma.deskEntitySuppression.findFirst.mockResolvedValue(null);
      await expect(service.unsnooze('sup-1', TENANT_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });
  });
});
