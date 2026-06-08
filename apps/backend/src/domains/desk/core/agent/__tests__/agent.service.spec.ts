import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';

import { AppCacheService } from '../../../../../infrastructure/cache/app-cache.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { createMockPrisma } from '../../../../../test/mocks/prisma.mock';

import { DeskAgentService } from '../agent.service';

describe('DeskAgentService', () => {
  let service: DeskAgentService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let cache: { get: jest.Mock; set: jest.Mock; del: jest.Mock; getOrSet: jest.Mock };

  beforeEach(async () => {
    prisma = createMockPrisma();
    cache = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      // default: bypass cache — call factory and return value
      getOrSet: jest.fn().mockImplementation(async (_k: string, factory: () => Promise<unknown>) => factory()),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        DeskAgentService,
        { provide: PrismaService, useValue: prisma },
        { provide: AppCacheService, useValue: cache },
      ],
    }).compile();
    service = moduleRef.get(DeskAgentService);
  });

  // ─── listForTenant ──────────────────────────────────────────────────

  describe('listForTenant', () => {
    it('returns roster with joined supervisor + rollups', async () => {
      prisma.deskAgent.findMany.mockResolvedValue([
        {
          id: 1,
          key: 'assistant',
          name: 'Billing',
          description: null,
          supervisor: { id: 42, firstName: 'Ada', lastName: 'Lovelace', role: UserRole.MEMBER },
          responsibilities: [
            { id: 10, lifecycle: 'AVAILABLE', enabled: true, lastRunAt: new Date('2026-04-20T10:00:00Z') },
            { id: 11, lifecycle: 'COMING_SOON', enabled: false, lastRunAt: null },
          ],
        },
      ]);
      prisma.deskEpisode.groupBy.mockResolvedValue([{ responsibilityId: 10, _count: { _all: 3 } }]);
      prisma.deskApproval.findMany.mockResolvedValue([
        { episode: { responsibilityId: 10 } },
        { episode: { responsibilityId: 10 } },
      ]);

      const roster = await service.listForTenant(5);
      expect(roster).toHaveLength(1);
      const row = roster[0];
      expect(row.key).toBe('assistant');
      expect(row.supervisor).toEqual({
        id: 42,
        firstName: 'Ada',
        lastName: 'Lovelace',
        role: UserRole.MEMBER,
      });
      expect(row.availableResponsibilityCount).toBe(1);
      expect(row.comingSoonResponsibilityCount).toBe(1);
      expect(row.openEpisodeCount).toBe(3);
      expect(row.pendingApprovalCount).toBe(2);
      expect(row.isActive).toBe(true);
      expect(row.lastRunAt).toBe('2026-04-20T10:00:00.000Z');
    });

    it('returns supervisor null when unassigned and handles empty rollups', async () => {
      prisma.deskAgent.findMany.mockResolvedValue([
        {
          id: 1,
          key: 'assistant',
          name: 'Dispatch',
          description: null,
          supervisor: null,
          responsibilities: [{ id: 20, lifecycle: 'AVAILABLE', enabled: false, lastRunAt: null }],
        },
      ]);
      prisma.deskEpisode.groupBy.mockResolvedValue([]);
      prisma.deskApproval.findMany.mockResolvedValue([]);

      const [row] = await service.listForTenant(1);
      expect(row.supervisor).toBeNull();
      expect(row.isActive).toBe(false);
      expect(row.openEpisodeCount).toBe(0);
      expect(row.pendingApprovalCount).toBe(0);
      expect(row.lastRunAt).toBeNull();
    });

    it('includes seeded agents even when their key is not in the registry', async () => {
      prisma.deskAgent.findMany.mockResolvedValue([
        {
          id: 99,
          key: 'unknown-agent',
          name: 'Ghost',
          description: null,
          supervisor: null,
          responsibilities: [],
        },
      ]);
      prisma.deskEpisode.groupBy.mockResolvedValue([]);
      prisma.deskApproval.findMany.mockResolvedValue([]);

      const rows = await service.listForTenant(1);
      expect(rows).toHaveLength(1);
      expect(rows[0].key).toBe('unknown-agent');
      expect(rows[0].availableResponsibilityCount).toBe(0);
    });
  });

  // ─── getDetailForTenant ────────────────────────────────────────────

  describe('getDetailForTenant', () => {
    it('returns detail with persona first line + supervisor', async () => {
      prisma.deskAgent.findUnique.mockResolvedValue({
        id: 1,
        key: 'assistant',
        name: 'Dispatch',
        description: 'Picks the best driver for new loads and watches late ETAs before they become problems.',
        supervisor: { id: 3, firstName: 'Jane', lastName: 'Doe', role: UserRole.ADMIN },
        responsibilities: [
          { key: 'driver_assignment', lifecycle: 'COMING_SOON', enabled: false, trustLevel: 'SUPERVISED' },
        ],
      });

      const detail = await service.getDetailForTenant(1, 'assistant');
      expect(detail.key).toBe('assistant');
      expect(detail.isActive).toBe(false);
      expect(detail.supervisor?.id).toBe(3);
      expect(detail.description?.length ?? 0).toBeGreaterThan(0);
      expect(detail.responsibilities).toHaveLength(1);
      expect(detail.responsibilities[0].lifecycle).toBe('COMING_SOON');
    });

    it('throws NotFound when agent missing', async () => {
      prisma.deskAgent.findUnique.mockResolvedValue(null);
      await expect(service.getDetailForTenant(1, 'sally-missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('marks isActive when any AVAILABLE responsibility is enabled', async () => {
      prisma.deskAgent.findUnique.mockResolvedValue({
        id: 2,
        key: 'assistant',
        name: 'Billing',
        description:
          'Keeps invoices moving — nudges overdue customers, handles close-out review, flags anything unusual for approval.',
        supervisor: null,
        responsibilities: [{ key: 'ar_followup', lifecycle: 'AVAILABLE', enabled: true, trustLevel: 'ASSISTED' }],
      });
      const detail = await service.getDetailForTenant(1, 'assistant');
      expect(detail.isActive).toBe(true);
    });
  });

  // ─── updateAgent ───────────────────────────────────────────────────

  describe('updateAgent', () => {
    beforeEach(() => {
      prisma.deskAgent.findUnique.mockResolvedValue({ id: 7 });
      prisma.deskAgent.update.mockResolvedValue({});
      prisma.deskResponsibility.updateMany.mockResolvedValue({ count: 2 });
    });

    it('bulk-enables responsibilities when enabled=true', async () => {
      const res = await service.updateAgent(1, 'assistant', { enabled: true });
      expect(prisma.deskResponsibility.updateMany).toHaveBeenCalledWith({
        where: { agentId: 7, lifecycle: 'AVAILABLE' },
        data: { enabled: true },
      });
      expect(res.updatedResponsibilityCount).toBe(2);
      expect(res.supervisorUpdated).toBe(false);
    });

    it('rebinds supervisor when userId is a valid OWNER/ADMIN/MEMBER', async () => {
      prisma.user.findFirst.mockResolvedValue({ role: UserRole.MEMBER });
      const res = await service.updateAgent(1, 'assistant', { supervisorUserId: 42 });
      expect(prisma.deskAgent.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { supervisorUserId: 42 },
      });
      expect(res.supervisorUpdated).toBe(true);
    });

    it('allows clearing supervisor with null (no user lookup)', async () => {
      await service.updateAgent(1, 'assistant', { supervisorUserId: null });
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
      expect(prisma.deskAgent.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { supervisorUserId: null },
      });
    });

    it('rejects an ineligible role as supervisor', async () => {
      prisma.user.findFirst.mockResolvedValue({ role: UserRole.SUPER_ADMIN });
      await expect(service.updateAgent(1, 'assistant', { supervisorUserId: 77 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects a user not in this tenant', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.updateAgent(1, 'assistant', { supervisorUserId: 77 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws NotFound for unknown agent key', async () => {
      prisma.deskAgent.findUnique.mockResolvedValueOnce(null);
      await expect(service.updateAgent(1, 'missing', { enabled: true })).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ─── bulkSetEnabled (legacy adapter) ──────────────────────────────

  describe('bulkSetEnabled', () => {
    it('delegates to updateAgent and exposes updatedCount', async () => {
      prisma.deskAgent.findUnique.mockResolvedValue({ id: 3 });
      prisma.deskResponsibility.updateMany.mockResolvedValue({ count: 5 });
      const res = await service.bulkSetEnabled(1, 'assistant', { enabled: false });
      expect(res.updatedCount).toBe(5);
    });
  });

  // ─── getActivity ──────────────────────────────────────────────────

  describe('getActivity', () => {
    beforeEach(() => {
      prisma.deskAgent.findUnique.mockResolvedValue({
        id: 5,
        responsibilities: [{ id: 100 }, { id: 101 }],
      });
      prisma.deskEpisode.count.mockResolvedValue(3);
      prisma.agentInvocationLog.count.mockResolvedValue(12);
      prisma.deskApproval.count.mockResolvedValue(1);
      prisma.deskEpisode.findFirst.mockResolvedValue({ openedAt: new Date('2026-04-22T10:00:00Z') });
    });

    it('returns windowed counts and lastActivityAt', async () => {
      const stats = await service.getActivity(1, 'assistant', '7d');
      expect(stats.episodeCount).toBe(3);
      expect(stats.toolCallCount).toBe(12);
      expect(stats.approvalCount).toBe(1);
      expect(stats.lastActivityAt).toBe('2026-04-22T10:00:00.000Z');
      expect(new Date(stats.windowEnd).getTime() - new Date(stats.windowStart).getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('returns zero tool calls when no responsibilities', async () => {
      prisma.deskAgent.findUnique.mockResolvedValue({ id: 5, responsibilities: [] });
      const stats = await service.getActivity(1, 'assistant', '24h');
      expect(stats.toolCallCount).toBe(0);
      expect(prisma.agentInvocationLog.count).not.toHaveBeenCalled();
    });

    it('throws NotFound for unknown agent', async () => {
      prisma.deskAgent.findUnique.mockResolvedValue(null);
      await expect(service.getActivity(1, 'missing', '7d')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('queries principalKind=desk_responsibility with prefixed audit ids', async () => {
      await service.getActivity(1, 'assistant', '7d');
      expect(prisma.agentInvocationLog.count).toHaveBeenCalledWith({
        where: {
          tenantId: 1,
          principalKind: 'desk_responsibility',
          principalId: { in: ['desk:100', 'desk:101'] },
          createdAt: expect.objectContaining({ gte: expect.any(Date), lt: expect.any(Date) }),
        },
      });
    });

    it('uses cache on a second call (getOrSet hit)', async () => {
      cache.getOrSet.mockReset();
      let hits = 0;
      cache.getOrSet.mockImplementation(async (_k: string, factory: () => Promise<unknown>) => {
        hits += 1;
        if (hits === 1) return factory();
        // Simulate cache hit
        return {
          episodeCount: 99,
          toolCallCount: 0,
          approvalCount: 0,
          lastActivityAt: null,
          windowStart: '2026-04-15T00:00:00.000Z',
          windowEnd: '2026-04-22T00:00:00.000Z',
        };
      });
      await service.getActivity(1, 'assistant', '7d');
      const cached = await service.getActivity(1, 'assistant', '7d');
      expect(cached.episodeCount).toBe(99);
      expect(prisma.deskEpisode.count).toHaveBeenCalledTimes(1);
    });
  });

  // ─── listEligibleSupervisors ──────────────────────────────────────

  describe('listEligibleSupervisors', () => {
    it('returns non-driver/customer active users sorted by last name', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 1, firstName: 'Ada', lastName: 'Aardvark', role: UserRole.OWNER },
        { id: 2, firstName: 'Bob', lastName: 'Builder', role: UserRole.ADMIN },
      ]);
      const rows = await service.listEligibleSupervisors(7);
      expect(rows).toHaveLength(2);
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: 7,
          isActive: true,
          deletedAt: null,
          role: { in: [UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER] },
        },
        select: { id: true, firstName: true, lastName: true, role: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      });
    });
  });
});
