import { UserRole } from '@prisma/client';

import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { createMockPrisma } from '../../../../../test/mocks/prisma.mock';

import { ApprovalEnrichmentService } from '../approval-enrichment.service';
import { ApprovalService, resolveApprovalScope } from '../approval.service';

class FakeInngest {
  send = jest.fn().mockResolvedValue(undefined);
}

describe('ApprovalService', () => {
  let service: ApprovalService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    prisma.deskApproval.findMany.mockResolvedValue([]);
    const enrichment = new ApprovalEnrichmentService();
    service = new ApprovalService(prisma as unknown as PrismaService, new FakeInngest() as any, enrichment);
  });

  describe('listPending scope', () => {
    it('default (no scope) — unrestricted tenant-wide query', async () => {
      await service.listPending(7);
      expect(prisma.deskApproval.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            decision: null,
            episode: { tenantId: 7 },
          },
        }),
      );
    });

    it('scope=all — same predicate as default', async () => {
      await service.listPending(7, { scope: 'all', currentUserId: 42 });
      const [call] = prisma.deskApproval.findMany.mock.calls;
      expect(call[0].where.episode).toEqual({ tenantId: 7 });
    });

    it('scope=mine — filters by ownerAgent.supervisorUserId = currentUserId', async () => {
      await service.listPending(7, { scope: 'mine', currentUserId: 42 });
      const [call] = prisma.deskApproval.findMany.mock.calls;
      expect(call[0].where.episode).toEqual({
        tenantId: 7,
        ownerAgent: { supervisorUserId: 42 },
      });
    });

    it('scope=mine with no currentUserId returns empty without hitting Prisma', async () => {
      const res = await service.listPending(7, { scope: 'mine' });
      expect(res).toEqual([]);
      expect(prisma.deskApproval.findMany).not.toHaveBeenCalled();
    });
  });

  describe('countPending', () => {
    beforeEach(() => {
      prisma.tenant.findUnique.mockResolvedValue({ timezone: 'UTC' });
    });

    it('returns all aggregates in parallel — including handled.today + handled.last7d', async () => {
      // Order per service:
      //   deskApproval.count   : allWaiting, mineWaiting
      //   deskEpisode.count    : allEscalated, mineEscalated,
      //                          allHandledToday, mineHandledToday,
      //                          allHandled7d, mineHandled7d
      prisma.deskApproval.count
        .mockResolvedValueOnce(10) // allWaiting
        .mockResolvedValueOnce(3); // mineWaiting
      prisma.deskEpisode.count
        .mockResolvedValueOnce(5) // allEscalated
        .mockResolvedValueOnce(1) // mineEscalated
        .mockResolvedValueOnce(8) // allHandledToday
        .mockResolvedValueOnce(2) // mineHandledToday
        .mockResolvedValueOnce(42) // allHandled7d
        .mockResolvedValueOnce(11); // mineHandled7d

      const result = await service.countPending(10, 99);
      expect(result).toEqual({
        mine: { waiting: 3, escalated: 1 },
        all: { waiting: 10, escalated: 5 },
        handled: {
          today: { mine: 2, all: 8 },
          last7d: { mine: 11, all: 42 },
        },
      });
    });

    it('filters mine scope by episode.ownerAgent.supervisorUserId', async () => {
      prisma.deskApproval.count.mockResolvedValue(0);
      prisma.deskEpisode.count.mockResolvedValue(0);

      await service.countPending(10, 99);

      // Second approval.count call is the "mine" branch.
      const approvalMineCall = prisma.deskApproval.count.mock.calls[1][0];
      expect(approvalMineCall.where.decision).toBeNull();
      expect(approvalMineCall.where.episode).toEqual({
        tenantId: 10,
        ownerAgent: { supervisorUserId: 99 },
      });

      // First approval.count is the "all" branch — no supervisor filter.
      const approvalAllCall = prisma.deskApproval.count.mock.calls[0][0];
      expect(approvalAllCall.where.episode).toEqual({ tenantId: 10 });
    });

    it('filters escalated episode counts by tenant and status', async () => {
      prisma.deskApproval.count.mockResolvedValue(0);
      prisma.deskEpisode.count.mockResolvedValue(0);

      await service.countPending(10, 99);

      const allEscalated = prisma.deskEpisode.count.mock.calls[0][0];
      expect(allEscalated.where).toEqual({ tenantId: 10, status: 'ESCALATED' });

      const mineEscalated = prisma.deskEpisode.count.mock.calls[1][0];
      expect(mineEscalated.where).toEqual({
        tenantId: 10,
        status: 'ESCALATED',
        ownerAgent: { supervisorUserId: 99 },
      });
    });

    it('countPending.handled.today uses tenant-local midnight', async () => {
      prisma.tenant.findUnique.mockResolvedValue({ timezone: 'America/Chicago' });
      prisma.deskApproval.count.mockResolvedValue(0);
      prisma.deskEpisode.count.mockResolvedValue(0);

      await service.countPending(10, 99);

      // handled.today.mine call: on deskEpisode with ownerAgent supervisor filter + closedAt gte
      const handledTodayMineCall = prisma.deskEpisode.count.mock.calls.find(
        (c) =>
          c[0].where?.ownerAgent?.supervisorUserId === 99 &&
          c[0].where?.closedAt?.gte &&
          Array.isArray(c[0].where?.status?.in) &&
          c[0].where.status.in.includes('RESOLVED'),
      );
      expect(handledTodayMineCall).toBeDefined();
      const gte = handledTodayMineCall![0].where.closedAt.gte as Date;
      // Midnight Chicago for "today" — cannot assert exact value, but must be in the last 24h from now.
      expect(gte.getTime()).toBeLessThanOrEqual(Date.now());
      expect(Date.now() - gte.getTime()).toBeLessThan(25 * 3_600_000);
    });

    it('countPending.handled.last7d uses now-7d in tenant timezone', async () => {
      prisma.tenant.findUnique.mockResolvedValue({ timezone: 'America/Chicago' });
      prisma.deskApproval.count.mockResolvedValue(0);
      prisma.deskEpisode.count.mockResolvedValue(0);

      await service.countPending(10, 99);

      // last7d.all — no supervisor filter, gte ≈ now - 7d
      const last7dAllCall = prisma.deskEpisode.count.mock.calls.find((c) => {
        const w = c[0].where;
        return (
          !w?.ownerAgent &&
          Array.isArray(w?.status?.in) &&
          w.status.in.includes('RESOLVED') &&
          w?.closedAt?.gte &&
          Date.now() - (w.closedAt.gte as Date).getTime() > 6 * 24 * 3_600_000
        );
      });
      expect(last7dAllCall).toBeDefined();
      const gte = last7dAllCall![0].where.closedAt.gte as Date;
      const msAgo = Date.now() - gte.getTime();
      // Must be between 7 and 8 days ago (absorbs any start-of-day shifting across TZ)
      expect(msAgo).toBeGreaterThan(6.5 * 24 * 3_600_000);
      expect(msAgo).toBeLessThan(8 * 24 * 3_600_000);
    });

    it('falls back to UTC when tenant has no timezone set', async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);
      prisma.deskApproval.count.mockResolvedValue(0);
      prisma.deskEpisode.count.mockResolvedValue(0);

      const result = await service.countPending(10, 99);
      // No throw; result still complete.
      expect(result.handled.today.all).toBe(0);
      expect(result.handled.last7d.all).toBe(0);
    });

    it('handled counts filter by terminal statuses (RESOLVED, REJECTED_BY_OPERATOR, EXPIRED)', async () => {
      prisma.deskApproval.count.mockResolvedValue(0);
      prisma.deskEpisode.count.mockResolvedValue(0);

      await service.countPending(10, 99);

      // Every handled query should use status.in with the three terminal outcomes
      const handledCalls = prisma.deskEpisode.count.mock.calls.filter((c) => Array.isArray(c[0].where?.status?.in));
      expect(handledCalls.length).toBe(4); // today × 2 + 7d × 2
      for (const call of handledCalls) {
        expect(call[0].where.status.in).toEqual(
          expect.arrayContaining(['RESOLVED', 'REJECTED_BY_OPERATOR', 'EXPIRED']),
        );
      }
    });
  });

  describe('create', () => {
    it('defaults expiresAt to 7 days from now', async () => {
      const fixedNow = new Date('2026-04-24T12:00:00Z').getTime();
      jest.spyOn(Date, 'now').mockReturnValue(fixedNow);
      prisma.deskApproval.create.mockResolvedValue({ id: 'app-1' });

      await service.create({
        episodeId: 'ep-1',
        stepId: 'step-1',
        proposedAction: { foo: 'bar' },
      });

      const call = prisma.deskApproval.create.mock.calls[0][0];
      const expected = new Date(fixedNow + 7 * 24 * 60 * 60 * 1000);
      expect(call.data.expiresAt).toEqual(expected);
      expect(call.data.episodeId).toBe('ep-1');
      expect(call.data.stepId).toBe('step-1');
      expect(call.data.proposedAction).toEqual({ foo: 'bar' });

      (Date.now as jest.Mock).mockRestore?.();
    });

    it('honors expiresInDays override', async () => {
      const fixedNow = new Date('2026-04-24T12:00:00Z').getTime();
      jest.spyOn(Date, 'now').mockReturnValue(fixedNow);
      prisma.deskApproval.create.mockResolvedValue({ id: 'app-1' });

      await service.create({
        episodeId: 'ep-1',
        stepId: 'step-1',
        proposedAction: {},
        expiresInDays: 2,
      });

      const call = prisma.deskApproval.create.mock.calls[0][0];
      expect(call.data.expiresAt).toEqual(new Date(fixedNow + 2 * 24 * 60 * 60 * 1000));

      (Date.now as jest.Mock).mockRestore?.();
    });
  });

  describe('claim', () => {
    it('succeeds when the optimistic update takes the row', async () => {
      prisma.deskApproval.updateMany.mockResolvedValue({ count: 1 });
      prisma.deskApproval.findUniqueOrThrow.mockResolvedValue({ id: 'app-1' });

      const result = await service.claim('app-1', 42);
      expect(result).toEqual({ id: 'app-1' });
      expect(prisma.deskApproval.updateMany).toHaveBeenCalledWith({
        where: { id: 'app-1', claimedByUserId: null, decision: null },
        data: expect.objectContaining({ claimedByUserId: 42 }),
      });
    });

    it('throws NotFoundException when the row does not exist', async () => {
      prisma.deskApproval.updateMany.mockResolvedValue({ count: 0 });
      prisma.deskApproval.findUnique.mockResolvedValue(null);
      await expect(service.claim('app-missing', 42)).rejects.toThrow('Approval not found');
    });

    it('throws ConflictException when already decided', async () => {
      prisma.deskApproval.updateMany.mockResolvedValue({ count: 0 });
      prisma.deskApproval.findUnique.mockResolvedValue({
        id: 'app-1',
        decision: 'APPROVED',
        claimedByUserId: 42,
      });
      await expect(service.claim('app-1', 99)).rejects.toThrow('Approval already decided');
    });

    it('throws ConflictException when already claimed by someone else', async () => {
      prisma.deskApproval.updateMany.mockResolvedValue({ count: 0 });
      prisma.deskApproval.findUnique.mockResolvedValue({
        id: 'app-1',
        decision: null,
        claimedByUserId: 42,
      });
      await expect(service.claim('app-1', 99)).rejects.toThrow(/already claimed/);
    });
  });

  describe('decide', () => {
    const baseApproval = {
      id: 'app-1',
      episodeId: 'ep-1',
      decision: null,
      claimedByUserId: null,
      episode: { id: 'ep-1', temporalWorkflowId: 'wf-1' },
    };

    it('records an APPROVED decision and emits the inngest event', async () => {
      prisma.deskApproval.findUnique.mockResolvedValue(baseApproval);
      prisma.deskApproval.update.mockResolvedValue({
        id: 'app-1',
        episodeId: 'ep-1',
        decision: 'APPROVED',
        terminateEpisode: false,
        editedAction: null,
        rejectionReason: null,
        decidedByUserId: 42,
      });

      const result = await service.decide({
        approvalId: 'app-1',
        userId: 42,
        decision: 'APPROVED' as any,
      });
      expect(result.decision).toBe('APPROVED');

      // inngest event published
      const inngest = (service as any).inngest as FakeInngest;
      expect(inngest.send).toHaveBeenCalledWith(
        'sally/desk.approval.decided',
        expect.objectContaining({
          approvalId: 'app-1',
          decision: 'APPROVED',
          decidedByUserId: 42,
        }),
      );
    });

    it('throws NotFoundException when the approval does not exist', async () => {
      prisma.deskApproval.findUnique.mockResolvedValue(null);
      await expect(service.decide({ approvalId: 'missing', userId: 1, decision: 'APPROVED' as any })).rejects.toThrow(
        'Approval not found',
      );
    });

    it('throws ConflictException when already decided', async () => {
      prisma.deskApproval.findUnique.mockResolvedValue({
        ...baseApproval,
        decision: 'APPROVED',
      });
      await expect(service.decide({ approvalId: 'app-1', userId: 42, decision: 'APPROVED' as any })).rejects.toThrow(
        'already decided',
      );
    });

    it('throws ForbiddenException when claimed by a different user', async () => {
      prisma.deskApproval.findUnique.mockResolvedValue({
        ...baseApproval,
        claimedByUserId: 1,
      });
      await expect(service.decide({ approvalId: 'app-1', userId: 2, decision: 'APPROVED' as any })).rejects.toThrow(
        /claimed by another user/,
      );
    });

    it('requires editedAction when decision=EDITED', async () => {
      prisma.deskApproval.findUnique.mockResolvedValue(baseApproval);
      await expect(service.decide({ approvalId: 'app-1', userId: 42, decision: 'EDITED' as any })).rejects.toThrow(
        /editedAction is required/,
      );
    });

    it('requires rejectionReason when decision=REJECTED', async () => {
      prisma.deskApproval.findUnique.mockResolvedValue(baseApproval);
      await expect(service.decide({ approvalId: 'app-1', userId: 42, decision: 'REJECTED' as any })).rejects.toThrow(
        /rejectionReason is required/,
      );
    });

    it('requires REJECTED when terminate=true', async () => {
      prisma.deskApproval.findUnique.mockResolvedValue(baseApproval);
      await expect(
        service.decide({
          approvalId: 'app-1',
          userId: 42,
          decision: 'APPROVED' as any,
          terminate: true,
        }),
      ).rejects.toThrow(/terminate=true requires decision=REJECTED/);
    });

    it('accepts a REJECTED + terminate combo', async () => {
      prisma.deskApproval.findUnique.mockResolvedValue(baseApproval);
      prisma.deskApproval.update.mockResolvedValue({
        id: 'app-1',
        episodeId: 'ep-1',
        decision: 'REJECTED',
        terminateEpisode: true,
        editedAction: null,
        rejectionReason: 'bad numbers',
        decidedByUserId: 42,
      });

      const result = await service.decide({
        approvalId: 'app-1',
        userId: 42,
        decision: 'REJECTED' as any,
        rejectionReason: 'bad numbers',
        terminate: true,
      });
      expect(result.terminateEpisode).toBe(true);
    });
  });

  describe('expireOverdue', () => {
    it('returns 0 and sends nothing when no approvals are overdue', async () => {
      prisma.deskApproval.findMany.mockResolvedValue([]);
      const result = await service.expireOverdue();
      expect(result).toBe(0);
      const inngest = (service as any).inngest as FakeInngest;
      expect(inngest.send).not.toHaveBeenCalled();
    });

    it('expires each overdue approval and emits one event per row', async () => {
      prisma.deskApproval.findMany.mockResolvedValue([
        { id: 'a1', episodeId: 'e1' },
        { id: 'a2', episodeId: 'e2' },
      ]);
      prisma.deskApproval.update.mockResolvedValue({});

      const result = await service.expireOverdue();
      expect(result).toBe(2);
      expect(prisma.deskApproval.update).toHaveBeenCalledTimes(2);
      const inngest = (service as any).inngest as FakeInngest;
      expect(inngest.send).toHaveBeenCalledTimes(2);
      expect(inngest.send).toHaveBeenCalledWith(
        'sally/desk.approval.decided',
        expect.objectContaining({
          approvalId: 'a1',
          decision: 'REJECTED',
          terminateEpisode: true,
          rejectionReason: 'auto-expired',
        }),
      );
    });
  });

  describe('findById', () => {
    it('returns the approval when it exists', async () => {
      prisma.deskApproval.findUnique.mockResolvedValue({ id: 'app-1' });
      const result = await service.findById('app-1');
      expect(result).toEqual({ id: 'app-1' });
    });

    it('throws NotFoundException when missing', async () => {
      prisma.deskApproval.findUnique.mockResolvedValue(null);
      await expect(service.findById('missing')).rejects.toThrow('Approval not found');
    });
  });

  describe('enrichApproval', () => {
    it('delegates to the enrichment service', async () => {
      const result = await service.enrichApproval({
        responsibilityKey: 'unknown_key',
        proposedAction: {},
        steps: [],
      });
      // Enrichment for unknown responsibility returns a default shape.
      expect(result).toBeDefined();
      expect(result).toHaveProperty('artifact');
    });
  });

  describe('listPending (slim shape)', () => {
    it('returns EpisodeListItem-shaped rows (no artifact / no sallysRead / no context)', async () => {
      const localPrisma = makePrismaWithOneApproval();
      const enrichment = { enrich: jest.fn() } as any;
      const svc = new ApprovalService(localPrisma as unknown as PrismaService, new FakeInngest() as any, enrichment);

      const rows = await svc.listPending(10, { limit: 10, scope: 'all' });
      expect(rows).toHaveLength(1);
      const row = rows[0] as any;

      // list-only fields present
      expect(row.id).toBeDefined();
      expect(row.episodeId).toBeDefined();
      expect(row.decisionTitle).toBeDefined();
      expect(row.agentKey).toBe('autumn');
      expect(row.agentName).toBe('Autumn');
      expect(row.requestedAt).toBeDefined();
      expect(row.expiresAt).toBeDefined();
      expect(row.responsibilityKey).toBeDefined();
      expect(row.responsibilityTitle).toBeDefined();
      expect(row.priority).toBeDefined();
      expect(row.status).toBeDefined();
      expect(row.openedAt).toBeDefined();

      // detail-only fields absent
      expect(row.artifact).toBeUndefined();
      expect(row.sallysRead).toBeUndefined();
      expect(row.context).toBeUndefined();
      expect(row.confidence).toBeUndefined();
      expect(row.decisionHeader).toBeUndefined();
      expect(row.episode).toBeUndefined();

      // enrichment NOT called in list path
      expect(enrichment.enrich).not.toHaveBeenCalled();
    });
  });
});

/**
 * Returns a mock Prisma with one DeskApproval row selecting the slim shape.
 * Episode carries ownerAgent (Autumn), responsibility, priority, status.
 */
function makePrismaWithOneApproval() {
  const prisma = createMockPrisma();
  prisma.deskApproval.findMany.mockResolvedValue([
    {
      id: 'app-1',
      episodeId: 'ep-1',
      requestedAt: new Date('2026-04-24T10:00:00Z'),
      expiresAt: new Date('2026-05-01T10:00:00Z'),
      episode: {
        id: 'ep-1',
        entityType: 'invoice',
        entityId: 'inv-1',
        entityLabel: 'Invoice NL-INV-1015',
        priority: 'NORMAL',
        status: 'WAITING_APPROVAL',
        openedAt: new Date('2026-04-24T09:00:00Z'),
        responsibility: { key: 'ar_followup', title: 'AR Follow-up' },
        ownerAgent: { key: 'autumn', name: 'Autumn' },
      },
    },
  ]);
  return prisma;
}

describe('resolveApprovalScope', () => {
  it('returns the explicit scope when provided', () => {
    expect(resolveApprovalScope('all', UserRole.MEMBER)).toBe('all');
    expect(resolveApprovalScope('mine', UserRole.OWNER)).toBe('mine');
  });

  it('defaults DISPATCHER to mine', () => {
    expect(resolveApprovalScope(undefined, UserRole.MEMBER)).toBe('mine');
  });

  it.each([UserRole.OWNER, UserRole.ADMIN, UserRole.SUPER_ADMIN])('defaults %s to all', (role) => {
    expect(resolveApprovalScope(undefined, role)).toBe('all');
  });
});
