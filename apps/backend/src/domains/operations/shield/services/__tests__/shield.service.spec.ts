import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { ShieldService } from '../shield.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../../../infrastructure/cache/sally-cache.service';
import { JobService } from '../../../../../infrastructure/queue/job.service';
import { QUEUE_NAMES } from '../../../../../infrastructure/queue/queue.constants';

describe('ShieldService', () => {
  let service: ShieldService;
  let prisma: any;
  let cache: any;
  let jobService: any;
  let auditQueue: any;

  beforeEach(async () => {
    prisma = {
      shieldAudit: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        count: jest.fn().mockResolvedValue(0),
      },
      shieldFinding: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      shieldCustomRule: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      job: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    cache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      getOrSet: jest.fn().mockImplementation((_key: string, fn: () => any) => fn()),
    };

    jobService = {
      createJob: jest.fn().mockResolvedValue({ id: 'job-001' }),
      cancelJob: jest.fn().mockResolvedValue({ id: 1 }),
    };

    auditQueue = {
      add: jest.fn().mockResolvedValue({ id: 'queue-job-001' }),
      getJob: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShieldService,
        { provide: PrismaService, useValue: prisma },
        { provide: SallyCacheService, useValue: cache },
        { provide: JobService, useValue: jobService },
        {
          provide: getQueueToken(QUEUE_NAMES.SAFETY_DETECT),
          useValue: auditQueue,
        },
      ],
    }).compile();

    service = module.get(ShieldService);
    jest.clearAllMocks();

    // Re-initialize after clearAllMocks
    cache.getOrSet.mockImplementation((_key: string, fn: () => any) => fn());
  });

  // ─── getLatestScores ───

  describe('getLatestScores', () => {
    it('should return scores from latest FULL audit', async () => {
      prisma.shieldAudit.findFirst.mockResolvedValue({
        overallScore: 85,
        hosScore: 90,
        driversScore: 80,
        vehiclesScore: 85,
        loadsScore: 75,
        statusLabel: 'AT_RISK',
        completedAt: new Date('2026-03-01'),
        scope: 'FULL',
      });

      const result = await service.getLatestScores(1);

      expect(result.overallScore).toBe(85);
      expect(result.hosScore).toBe(90);
      expect(result.driversScore).toBe(80);
      expect(result.vehiclesScore).toBe(85);
      expect(result.loadsScore).toBe(75);
      expect(result.statusLabel).toBe('AT_RISK');
    });

    it('should return nulls when no completed audit exists', async () => {
      prisma.shieldAudit.findFirst.mockResolvedValue(null);

      const result = await service.getLatestScores(1);

      expect(result.overallScore).toBeNull();
      expect(result.hosScore).toBeNull();
      expect(result.driversScore).toBeNull();
      expect(result.vehiclesScore).toBeNull();
      expect(result.loadsScore).toBeNull();
    });

    it('should override with more recent per-entity audit scores', async () => {
      // First call: FULL audit
      prisma.shieldAudit.findFirst.mockResolvedValueOnce({
        overallScore: 80,
        hosScore: 70,
        driversScore: 75,
        vehiclesScore: 80,
        loadsScore: 85,
        statusLabel: 'AT_RISK',
        completedAt: new Date('2026-03-01'),
        scope: 'FULL',
      });

      // Per-entity calls: HOS has newer score
      prisma.shieldAudit.findFirst
        .mockResolvedValueOnce({
          hosScore: 95,
          completedAt: new Date('2026-03-02'),
        }) // HOS - newer
        .mockResolvedValueOnce({
          driversScore: 75,
          completedAt: new Date('2026-02-28'),
        }) // DRIVERS - older
        .mockResolvedValueOnce(null) // VEHICLES - no per-entity
        .mockResolvedValueOnce(null); // LOADS - no per-entity

      const result = await service.getLatestScores(1);

      expect(result.hosScore).toBe(95); // overridden with newer
      expect(result.driversScore).toBe(75); // not overridden (older)
    });

    it('should use cache via getOrSet', async () => {
      const cachedScores = { overallScore: 90, hosScore: 95 };
      cache.getOrSet.mockResolvedValueOnce(cachedScores);

      const result = await service.getLatestScores(1);

      expect(result).toBe(cachedScores);
      expect(cache.getOrSet).toHaveBeenCalledWith(
        expect.stringContaining('shield'),
        expect.any(Function),
        expect.any(Number),
      );
    });
  });

  // ─── getFindings ───

  describe('getFindings', () => {
    it('should return findings for tenant without filters', async () => {
      const findings = [{ id: 'f1', title: 'Expired CDL' }];
      prisma.shieldFinding.findMany.mockResolvedValue(findings);

      const result = await service.getFindings(1);

      expect(result).toEqual(findings);
      expect(prisma.shieldFinding.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 1 },
          take: 100,
        }),
      );
    });

    it('should filter by severity', async () => {
      await service.getFindings(1, { severity: 'CRITICAL' });

      expect(prisma.shieldFinding.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ severity: 'CRITICAL' }),
        }),
      );
    });

    it('should filter by category', async () => {
      await service.getFindings(1, { category: 'HOS' });

      expect(prisma.shieldFinding.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ category: 'HOS' }),
        }),
      );
    });

    it('should filter by isResolved', async () => {
      await service.getFindings(1, { isResolved: false });

      expect(prisma.shieldFinding.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isResolved: false }),
        }),
      );
    });
  });

  // ─── triggerAudit ───

  describe('triggerAudit', () => {
    it('should return existing audit if one is already in progress', async () => {
      prisma.shieldAudit.findFirst.mockResolvedValueOnce({
        id: 'existing-audit',
        status: 'RUNNING',
      });

      const result = await service.triggerAudit({
        tenantId: 1,
        scope: 'FULL',
        triggeredBy: 'MANUAL',
        triggeredById: 1,
      });

      expect(result.queued).toBe(false);
      expect(result.auditId).toBe('existing-audit');
      expect(result.message).toContain('already in progress');
      expect(prisma.shieldAudit.create).not.toHaveBeenCalled();
    });

    it('should create audit and queue job when no audit is running', async () => {
      prisma.shieldAudit.findFirst.mockResolvedValueOnce(null);
      prisma.shieldAudit.create.mockResolvedValueOnce({ id: 'new-audit-001' });

      const result = await service.triggerAudit({
        tenantId: 1,
        scope: 'FULL',
        triggeredBy: 'MANUAL',
        triggeredById: 5,
      });

      expect(result.queued).toBe(true);
      expect(result.auditId).toBe('new-audit-001');

      expect(prisma.shieldAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 1,
          scope: 'FULL',
          status: 'QUEUED',
          triggeredBy: 'MANUAL',
          triggeredById: 5,
          includeAi: true,
          auditPeriodDays: 30,
        }),
      });

      expect(jobService.createJob).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 1,
          category: 'safety',
          type: 'audit',
        }),
      );

      expect(auditQueue.add).toHaveBeenCalled();
    });

    it('should respect custom auditPeriodDays', async () => {
      prisma.shieldAudit.findFirst.mockResolvedValueOnce(null);
      prisma.shieldAudit.create.mockResolvedValueOnce({ id: 'new-audit-002' });

      await service.triggerAudit({
        tenantId: 1,
        scope: 'FULL',
        triggeredBy: 'MANUAL',
        auditPeriodDays: 90,
      });

      expect(prisma.shieldAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ auditPeriodDays: 90 }),
      });
    });
  });

  // ─── getAuditHistory ───

  describe('getAuditHistory', () => {
    it('should return paginated audit history', async () => {
      const audits = [
        { id: 'a1', overallScore: 90, status: 'COMPLETED' },
        { id: 'a2', overallScore: 75, status: 'COMPLETED' },
      ];
      prisma.shieldAudit.findMany.mockResolvedValue(audits);
      prisma.shieldAudit.count.mockResolvedValue(2);

      const result = await service.getAuditHistory(1, 20, 0);

      expect(result.audits).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(prisma.shieldAudit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 1 },
          take: 20,
          skip: 0,
        }),
      );
    });

    it('should enforce tenant isolation', async () => {
      await service.getAuditHistory(42);

      expect(prisma.shieldAudit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 42 }),
        }),
      );
    });

    it('should apply date range filters', async () => {
      prisma.shieldAudit.findMany.mockResolvedValue([]);
      prisma.shieldAudit.count.mockResolvedValue(0);

      await service.getAuditHistory(1, 20, 0, '2026-01-01', '2026-03-31');

      expect(prisma.shieldAudit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 1,
            createdAt: expect.any(Object),
          }),
        }),
      );
    });
  });

  // ─── resolveFinding ───

  describe('resolveFinding', () => {
    it('should mark finding as resolved with user and timestamp', async () => {
      prisma.shieldFinding.update.mockResolvedValue({
        id: 'f1',
        isResolved: true,
      });

      await service.resolveFinding(1, 'f1', 5);

      expect(prisma.shieldFinding.update).toHaveBeenCalledWith({
        where: { id: 'f1', tenantId: 1 },
        data: expect.objectContaining({
          isResolved: true,
          resolvedAt: expect.any(Date),
          resolvedById: 5,
        }),
      });
    });
  });

  // ─── bulkResolveFindings ───

  describe('bulkResolveFindings', () => {
    it('should bulk resolve multiple findings', async () => {
      prisma.shieldFinding.updateMany.mockResolvedValue({ count: 3 });

      await service.bulkResolveFindings(1, ['f1', 'f2', 'f3'], 5);

      expect(prisma.shieldFinding.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['f1', 'f2', 'f3'] }, tenantId: 1 },
        data: expect.objectContaining({
          isResolved: true,
          resolvedAt: expect.any(Date),
          resolvedById: 5,
        }),
      });
    });
  });

  // ─── Custom Rules ───

  describe('custom rules', () => {
    it('should list custom rules for tenant', async () => {
      const rules = [{ id: 'r1', rule: 'All drivers must have valid CDL' }];
      prisma.shieldCustomRule.findMany.mockResolvedValue(rules);

      const result = await service.getCustomRules(1);

      expect(result).toEqual(rules);
    });

    it('should create a custom rule', async () => {
      prisma.shieldCustomRule.create.mockResolvedValue({
        id: 'r2',
        rule: 'No expired insurance',
      });

      await service.createCustomRule(1, 'No expired insurance', 5);

      expect(prisma.shieldCustomRule.create).toHaveBeenCalledWith({
        data: { tenantId: 1, rule: 'No expired insurance', createdBy: 5 },
      });
    });

    it('should delete a custom rule scoped to tenant', async () => {
      await service.deleteCustomRule(1, 'r1');

      expect(prisma.shieldCustomRule.delete).toHaveBeenCalledWith({
        where: { id: 'r1', tenantId: 1 },
      });
    });
  });

  // ─── getNextScheduledAuditTime ───

  describe('getNextScheduledAuditTime', () => {
    it('should return a future date at 2AM UTC', () => {
      const next = service.getNextScheduledAuditTime();

      expect(next.getUTCHours()).toBe(2);
      expect(next.getUTCMinutes()).toBe(0);
      expect(next > new Date()).toBe(true);
    });
  });

  // ─── getLatestAudit ───

  describe('getLatestAudit', () => {
    it('should return latest completed audit with unresolved findings', async () => {
      const audit = {
        id: 'a1',
        status: 'COMPLETED',
        findings: [{ id: 'f1', isResolved: false }],
      };
      prisma.shieldAudit.findFirst.mockResolvedValue(audit);

      const result = await service.getLatestAudit(1);

      expect(result).toEqual(audit);
      expect(prisma.shieldAudit.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 1, status: 'COMPLETED' },
          orderBy: { completedAt: 'desc' },
        }),
      );
    });
  });

  // ─── getInProgressAudit ───

  describe('getInProgressAudit', () => {
    it('should find QUEUED or RUNNING audits within the stale window', async () => {
      await service.getInProgressAudit(1);

      expect(prisma.shieldAudit.findFirst).toHaveBeenCalledWith({
        where: {
          tenantId: 1,
          status: { in: ['QUEUED', 'RUNNING'] },
          createdAt: { gte: expect.any(Date) },
        },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should apply a stale cutoff so orphaned audits age out', async () => {
      await service.getInProgressAudit(1);

      const where = prisma.shieldAudit.findFirst.mock.calls[0][0].where;
      const cutoff: Date = where.createdAt.gte;
      // Cutoff must be in the past (now - 10min), proving stale rows are excluded.
      expect(cutoff.getTime()).toBeLessThan(Date.now());
      expect(cutoff.getTime()).toBeGreaterThan(Date.now() - 11 * 60 * 1000);
    });
  });

  // ─── getLastFailedAudit ───

  describe('getLastFailedAudit', () => {
    it('should find the most recent FAILED audit', async () => {
      prisma.shieldAudit.findFirst.mockResolvedValue({
        id: 'a-fail',
        status: 'FAILED',
        createdAt: new Date(),
      });

      const result = await service.getLastFailedAudit(1);

      expect(prisma.shieldAudit.findFirst).toHaveBeenCalledWith({
        where: { tenantId: 1, status: 'FAILED' },
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true, createdAt: true },
      });
      expect(result).toBeDefined();
      expect(result.status).toBe('FAILED');
    });

    it('should return null when no failed audits exist', async () => {
      prisma.shieldAudit.findFirst.mockResolvedValue(null);

      const result = await service.getLastFailedAudit(1);
      expect(result).toBeNull();
    });
  });

  // ─── getAuditById ───

  describe('getAuditById', () => {
    it('should return audit with findings and triggeredByUser', async () => {
      const audit = {
        id: 'a1',
        tenantId: 1,
        findings: [],
        triggeredByUser: { firstName: 'John', lastName: 'Doe' },
      };
      prisma.shieldAudit.findFirst.mockResolvedValue(audit);

      const result = await service.getAuditById(1, 'a1');

      expect(result).toEqual(audit);
      expect(prisma.shieldAudit.findFirst).toHaveBeenCalledWith({
        where: { id: 'a1', tenantId: 1 },
        include: {
          findings: { orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }] },
          triggeredByUser: { select: { firstName: true, lastName: true } },
        },
      });
    });

    it('should return null when audit not found', async () => {
      prisma.shieldAudit.findFirst.mockResolvedValue(null);

      const result = await service.getAuditById(1, 'nonexistent');
      expect(result).toBeNull();
    });
  });

  // ─── updateCustomRule ───

  describe('updateCustomRule', () => {
    it('should update rule text', async () => {
      prisma.shieldCustomRule.update.mockResolvedValue({
        id: 'r1',
        rule: 'Updated rule',
      });

      await service.updateCustomRule(1, 'r1', { rule: 'Updated rule' });

      expect(prisma.shieldCustomRule.update).toHaveBeenCalledWith({
        where: { id: 'r1', tenantId: 1 },
        data: { rule: 'Updated rule' },
      });
    });

    it('should toggle isActive flag', async () => {
      prisma.shieldCustomRule.update.mockResolvedValue({
        id: 'r1',
        isActive: false,
      });

      await service.updateCustomRule(1, 'r1', { isActive: false });

      expect(prisma.shieldCustomRule.update).toHaveBeenCalledWith({
        where: { id: 'r1', tenantId: 1 },
        data: { isActive: false },
      });
    });
  });

  // ─── triggerAudit with custom params ───

  describe('triggerAudit — custom params', () => {
    it('should respect includeAi false', async () => {
      prisma.shieldAudit.findFirst.mockResolvedValueOnce(null);
      prisma.shieldAudit.create.mockResolvedValueOnce({ id: 'new-audit' });

      await service.triggerAudit({
        tenantId: 1,
        scope: 'FULL',
        triggeredBy: 'MANUAL',
        includeAi: false,
      });

      expect(prisma.shieldAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ includeAi: false }),
      });
    });

    it('should default triggeredById to null when not provided', async () => {
      prisma.shieldAudit.findFirst.mockResolvedValueOnce(null);
      prisma.shieldAudit.create.mockResolvedValueOnce({ id: 'new-audit' });

      await service.triggerAudit({
        tenantId: 1,
        scope: 'FULL',
        triggeredBy: 'SCHEDULED',
      });

      expect(prisma.shieldAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          triggeredById: undefined,
        }),
      });
    });
  });

  // ─── getAuditHistory with date range ───

  describe('getAuditHistory — with offset', () => {
    it('should support custom limit and offset', async () => {
      prisma.shieldAudit.findMany.mockResolvedValue([]);
      prisma.shieldAudit.count.mockResolvedValue(0);

      await service.getAuditHistory(1, 5, 10);

      expect(prisma.shieldAudit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 5,
          skip: 10,
        }),
      );
    });
  });

  // ─── getNextScheduledAuditTime — more edge cases ───

  describe('getNextScheduledAuditTime — edge cases', () => {
    it('should return 2AM UTC with zero minutes and seconds', () => {
      const next = service.getNextScheduledAuditTime();
      expect(next.getUTCMinutes()).toBe(0);
      expect(next.getUTCSeconds()).toBe(0);
      expect(next.getUTCMilliseconds()).toBe(0);
    });
  });

  // ─── disputeFinding ───

  describe('disputeFinding', () => {
    it('throws NotFoundException when finding does not exist', async () => {
      prisma.shieldFinding.findFirst.mockResolvedValue(null);
      await expect(service.disputeFinding(1, 'f-missing', 7, 'test')).rejects.toThrow(
        'Shield finding f-missing not found',
      );
    });

    it('throws BadRequestException when finding is already resolved', async () => {
      prisma.shieldFinding.findFirst.mockResolvedValue({
        id: 'f-1',
        isResolved: true,
        isDisputed: false,
      });
      await expect(service.disputeFinding(1, 'f-1', 7, 'test')).rejects.toThrow(/resolved/);
    });

    it('throws BadRequestException when finding is already disputed', async () => {
      prisma.shieldFinding.findFirst.mockResolvedValue({
        id: 'f-1',
        isResolved: false,
        isDisputed: true,
      });
      await expect(service.disputeFinding(1, 'f-1', 7, 'test')).rejects.toThrow(/already under dispute/);
    });

    it('updates finding with dispute fields when eligible', async () => {
      prisma.shieldFinding.findFirst.mockResolvedValue({
        id: 'f-1',
        isResolved: false,
        isDisputed: false,
      });
      prisma.shieldFinding.update.mockResolvedValue({
        id: 'f-1',
        isDisputed: true,
      });
      const result = await service.disputeFinding(1, 'f-1', 7, 'Driver was off-duty');
      expect(prisma.shieldFinding.update).toHaveBeenCalledWith({
        where: { id: 'f-1', tenantId: 1 },
        data: {
          isDisputed: true,
          disputedAt: expect.any(Date),
          disputedById: 7,
          disputeReason: 'Driver was off-duty',
        },
      });
      expect(result.isDisputed).toBe(true);
    });
  });

  // ─── triggerAudit — stale self-heal ───

  describe('triggerAudit — stale self-heal', () => {
    it('auto-heals orphaned audits before queueing a new run', async () => {
      // No live in-progress audit (stale rows excluded by the cutoff).
      prisma.shieldAudit.findFirst.mockResolvedValueOnce(null);
      prisma.shieldAudit.updateMany.mockResolvedValueOnce({ count: 2 });
      prisma.shieldAudit.create.mockResolvedValueOnce({ id: 'fresh-audit' });

      const result = await service.triggerAudit({
        tenantId: 1,
        scope: 'FULL',
        triggeredBy: 'MANUAL',
      });

      expect(prisma.shieldAudit.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 1,
            status: { in: ['QUEUED', 'RUNNING'] },
            createdAt: { lt: expect.any(Date) },
          }),
          data: expect.objectContaining({ status: 'CANCELLED' }),
        }),
      );
      expect(result.queued).toBe(true);
      expect(result.auditId).toBe('fresh-audit');
    });

    it('does NOT queue a new run when a live audit is in progress', async () => {
      prisma.shieldAudit.findFirst.mockResolvedValueOnce({ id: 'live-audit', status: 'RUNNING' });

      const result = await service.triggerAudit({
        tenantId: 1,
        scope: 'FULL',
        triggeredBy: 'MANUAL',
      });

      expect(result.queued).toBe(false);
      expect(result.auditId).toBe('live-audit');
      expect(prisma.shieldAudit.updateMany).not.toHaveBeenCalled();
      expect(prisma.shieldAudit.create).not.toHaveBeenCalled();
    });

    it('uses the stale cutoff for the duplicate guard', async () => {
      prisma.shieldAudit.findFirst.mockResolvedValueOnce(null);
      prisma.shieldAudit.create.mockResolvedValueOnce({ id: 'a' });

      await service.triggerAudit({ tenantId: 1, scope: 'FULL', triggeredBy: 'MANUAL' });

      expect(prisma.shieldAudit.findFirst).toHaveBeenCalledWith({
        where: expect.objectContaining({
          tenantId: 1,
          status: { in: ['QUEUED', 'RUNNING'] },
          createdAt: { gte: expect.any(Date) },
        }),
      });
    });
  });

  // ─── cancelAudit ───

  describe('cancelAudit', () => {
    it('throws NotFoundException when the audit does not exist', async () => {
      prisma.shieldAudit.findFirst.mockResolvedValueOnce(null);

      await expect(service.cancelAudit(1, 'missing')).rejects.toThrow('Audit not found');
    });

    it('throws BadRequestException when the audit already finished', async () => {
      prisma.shieldAudit.findFirst.mockResolvedValueOnce({ id: 'a1', status: 'COMPLETED' });

      await expect(service.cancelAudit(1, 'a1')).rejects.toThrow(/already finished/);
      expect(prisma.shieldAudit.update).not.toHaveBeenCalled();
    });

    it('cancels an in-progress audit and clears the cache', async () => {
      prisma.shieldAudit.findFirst.mockResolvedValueOnce({ id: 'a1', status: 'RUNNING' });
      prisma.job.findFirst.mockResolvedValueOnce(null);

      const result = await service.cancelAudit(1, 'a1');

      expect(prisma.shieldAudit.update).toHaveBeenCalledWith({
        where: { id: 'a1' },
        data: expect.objectContaining({
          status: 'CANCELLED',
          completedAt: expect.any(Date),
          errorMessage: 'Cancelled by user',
        }),
      });
      expect(cache.del).toHaveBeenCalledWith(expect.stringContaining('shield'));
      expect(result).toEqual({ cancelled: true, auditId: 'a1' });
    });

    it('enforces tenant scoping on the lookup', async () => {
      prisma.shieldAudit.findFirst.mockResolvedValueOnce({ id: 'a1', status: 'QUEUED' });
      prisma.job.findFirst.mockResolvedValueOnce(null);

      await service.cancelAudit(42, 'a1');

      expect(prisma.shieldAudit.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'a1', tenantId: 42 } }),
      );
    });

    it('removes the queued BullMQ job and cancels the System Activity job', async () => {
      prisma.shieldAudit.findFirst.mockResolvedValueOnce({ id: 'a1', status: 'QUEUED' });
      prisma.job.findFirst.mockResolvedValueOnce({ id: 7 });
      const remove = jest.fn().mockResolvedValue(undefined);
      auditQueue.getJob.mockResolvedValueOnce({
        isActive: jest.fn().mockResolvedValue(false),
        remove,
      });

      await service.cancelAudit(1, 'a1');

      expect(remove).toHaveBeenCalled();
      expect(jobService.cancelJob).toHaveBeenCalledWith(7);
    });

    it('does not remove a BullMQ job that is actively running', async () => {
      prisma.shieldAudit.findFirst.mockResolvedValueOnce({ id: 'a1', status: 'RUNNING' });
      prisma.job.findFirst.mockResolvedValueOnce({ id: 8 });
      const remove = jest.fn();
      auditQueue.getJob.mockResolvedValueOnce({
        isActive: jest.fn().mockResolvedValue(true),
        remove,
      });

      await service.cancelAudit(1, 'a1');

      expect(remove).not.toHaveBeenCalled();
      // System Activity job is still marked cancelled even if the worker is mid-run.
      expect(jobService.cancelJob).toHaveBeenCalledWith(8);
    });

    it('still cancels the audit when BullMQ job removal throws', async () => {
      prisma.shieldAudit.findFirst.mockResolvedValueOnce({ id: 'a1', status: 'QUEUED' });
      prisma.job.findFirst.mockResolvedValueOnce({ id: 9 });
      auditQueue.getJob.mockRejectedValueOnce(new Error('redis down'));

      const result = await service.cancelAudit(1, 'a1');

      expect(result.cancelled).toBe(true);
      expect(jobService.cancelJob).toHaveBeenCalledWith(9);
    });
  });
});
