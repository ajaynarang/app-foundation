// Mock Mastra/AI modules before any imports to avoid ESM issues
jest.mock('../../../../../domains/ai/sally-ai/mastra/mastra.provider', () => ({}));
jest.mock('../../../../../domains/ai/infrastructure/providers/structured-output.service', () => ({
  StructuredOutputService: jest.fn(),
}));
jest.mock('../../../../../domains/prompting', () => ({
  PromptingService: jest.fn(),
  PROMPT_NAMES: {},
}));
jest.mock('../../../../../domains/ai/infrastructure/providers/ai-provider', () => ({
  isAiConfigured: jest.fn().mockReturnValue(false),
}));
jest.mock('../shield-ai-analyst.service', () => ({
  ShieldAIAnalyst: jest.fn(),
}));

import type { JobEnvelope } from '@sally/shared-types';
import { ShieldAuditJobHandler } from '../shield-audit.processor';
import { SALLY_EVENTS } from '../../../../../infrastructure/events/sally-events.constants';
import { SAFETY_DETECT_JOB_NAMES } from '../../../../../infrastructure/queue/queue.constants';
import { DIGEST_LOCAL_HOUR, TENANT_JOB_KEYS } from '../../../../../shared/constants/scheduling.constants';

function makeEnvelope<P>(payload: P): JobEnvelope<P> {
  return {
    tenantId: '1',
    correlationId: 'corr-1',
    payload,
    metadata: { enqueuedAt: new Date().toISOString(), source: 'api', version: 1 },
  };
}

describe('ShieldAuditJobHandler', () => {
  let processor: ShieldAuditJobHandler;
  let prisma: any;
  let ruleEngine: any;
  let aiAnalyst: any;
  let eventEmitter: any;
  let notificationService: any;
  let jobService: any;
  let shieldQueue: any;
  let timezoneService: any;
  let tenantJobRun: any;

  const baseCategoryResult = (category: string, score = 90, findings: any[] = []) => ({
    category,
    score,
    findings,
    coverage: [],
  });

  beforeEach(() => {
    prisma = {
      featureFlag: { findUnique: jest.fn().mockResolvedValue(null) },
      tenant: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({ jobsPaused: false }),
        update: jest.fn().mockResolvedValue({}),
      },
      fleetOperationsSettings: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      shieldAudit: {
        create: jest.fn().mockResolvedValue({ id: 'audit-001' }),
        update: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue(null),
        // Default: audit still QUEUED so the cancelled-guard lets processing proceed.
        findUnique: jest.fn().mockResolvedValue({ status: 'QUEUED' }),
      },
      shieldFinding: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      shieldCustomRule: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      conversation: { findUnique: jest.fn().mockResolvedValue(null) },
      conversationMessage: { create: jest.fn().mockResolvedValue({}) },
    };

    ruleEngine = {
      checkHOS: jest.fn().mockResolvedValue(baseCategoryResult('HOS')),
      checkDrivers: jest.fn().mockResolvedValue(baseCategoryResult('DRIVERS')),
      checkVehicles: jest.fn().mockResolvedValue(baseCategoryResult('VEHICLES')),
      checkLoads: jest.fn().mockResolvedValue(baseCategoryResult('LOADS')),
      checkCrossEntity: jest.fn().mockResolvedValue([]),
    };

    aiAnalyst = {
      analyze: jest.fn().mockResolvedValue({
        response: {
          summary: 'All good',
          insights: [],
          priorityActions: [],
          findings: [],
          skippedRules: [],
        },
        modelUsed: 'gpt-4o',
        durationMs: 1200,
      }),
    };

    eventEmitter = {
      emit: jest.fn().mockResolvedValue(undefined),
    };

    notificationService = {
      create: jest.fn().mockResolvedValue({ notificationId: 'notif-001' }),
    };

    jobService = {
      createJob: jest.fn().mockResolvedValue({ id: 'job-001' }),
      markProcessing: jest.fn().mockResolvedValue(undefined),
      markCompleted: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
    };

    shieldQueue = {
      add: jest.fn().mockResolvedValue({ id: 'q-001' }),
    };

    timezoneService = {
      resolveTenantTimezone: jest.fn().mockResolvedValue('UTC'),
      localHour: jest.fn().mockReturnValue(DIGEST_LOCAL_HOUR),
      localDate: jest.fn().mockReturnValue('2026-05-29'),
    };

    tenantJobRun = {
      hasRunOn: jest.fn().mockResolvedValue(false),
      markRanOn: jest.fn().mockResolvedValue(undefined),
    };

    processor = new ShieldAuditJobHandler(
      prisma,
      ruleEngine,
      aiAnalyst,
      eventEmitter,
      notificationService,
      jobService,
      shieldQueue,
      timezoneService,
      tenantJobRun,
    );
  });

  const makeJob = (payload: any, opts?: { name?: string; attemptsMade?: number; attempts?: number }) =>
    ({
      id: 'job-1',
      name: opts?.name ?? SAFETY_DETECT_JOB_NAMES.AUDIT,
      data: makeEnvelope(payload),
      attemptsMade: opts?.attemptsMade ?? 0,
      opts: { attempts: opts?.attempts ?? 2 },
    }) as any;

  // ─── FULL scope audit ───

  describe('process — FULL scope', () => {
    it('should invoke all four rule engine checks', async () => {
      await processor.run(
        makeJob({
          tenantId: 1,
          scope: 'FULL',
          auditId: 'a1',
          jobId: 'j1',
          includeAi: false,
        }),
      );

      expect(ruleEngine.checkHOS).toHaveBeenCalledWith(1);
      expect(ruleEngine.checkDrivers).toHaveBeenCalledWith(1);
      expect(ruleEngine.checkVehicles).toHaveBeenCalledWith(1);
      expect(ruleEngine.checkLoads).toHaveBeenCalledWith(1, 30);
      expect(ruleEngine.checkCrossEntity).toHaveBeenCalledWith(1);
    });

    it('should update audit status to RUNNING then COMPLETED', async () => {
      await processor.run(
        makeJob({
          tenantId: 1,
          scope: 'FULL',
          auditId: 'a1',
          includeAi: false,
        }),
      );

      expect(prisma.shieldAudit.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'a1' },
          data: expect.objectContaining({ status: 'RUNNING' }),
        }),
      );

      expect(prisma.shieldAudit.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'a1' },
          data: expect.objectContaining({
            status: 'COMPLETED',
            overallScore: expect.any(Number),
          }),
        }),
      );
    });

    it('should persist findings to database', async () => {
      const finding = {
        category: 'HOS',
        severity: 'CRITICAL',
        title: 'Expired CDL',
        description: 'CDL expired',
      };
      ruleEngine.checkHOS.mockResolvedValue(baseCategoryResult('HOS', 85, [finding]));

      await processor.run(
        makeJob({
          tenantId: 1,
          scope: 'FULL',
          auditId: 'a1',
          includeAi: false,
        }),
      );

      expect(prisma.shieldFinding.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            auditId: 'a1',
            tenantId: 1,
            category: 'HOS',
            severity: 'CRITICAL',
            title: 'Expired CDL',
          }),
        ]),
      });
    });

    it('should emit SHIELD_AUDIT_COMPLETE event', async () => {
      await processor.run(
        makeJob({
          tenantId: 1,
          scope: 'FULL',
          auditId: 'a1',
          includeAi: false,
        }),
      );

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.SHIELD_AUDIT_COMPLETE,
        1,
        expect.objectContaining({ auditId: 'a1' }),
      );
    });

    it('should mark job as completed', async () => {
      await processor.run(
        makeJob({
          tenantId: 1,
          scope: 'FULL',
          auditId: 'a1',
          jobId: 'j1',
          includeAi: false,
        }),
      );

      expect(jobService.markProcessing).toHaveBeenCalledWith('j1');
      expect(jobService.markCompleted).toHaveBeenCalledWith('j1', expect.objectContaining({ auditId: 'a1' }));
    });
  });

  // ─── Per-entity scope ───

  describe('process — per-entity scope', () => {
    it('should only run the specific check for HOS scope', async () => {
      await processor.run(
        makeJob({
          tenantId: 1,
          scope: 'HOS',
          auditId: 'a2',
          includeAi: false,
        }),
      );

      expect(ruleEngine.checkHOS).toHaveBeenCalled();
      expect(ruleEngine.checkDrivers).not.toHaveBeenCalled();
      expect(ruleEngine.checkVehicles).not.toHaveBeenCalled();
      expect(ruleEngine.checkLoads).not.toHaveBeenCalled();
      expect(ruleEngine.checkCrossEntity).not.toHaveBeenCalled();
    });
  });

  // ─── Error handling ───

  describe('process — error handling', () => {
    it('should update audit to FAILED on rule engine error', async () => {
      ruleEngine.checkHOS.mockRejectedValue(new Error('Rule engine crashed'));

      await expect(
        processor.run(
          makeJob({
            tenantId: 1,
            scope: 'FULL',
            auditId: 'a3',
            jobId: 'j3',
            includeAi: false,
          }),
        ),
      ).rejects.toThrow('Rule engine crashed');

      expect(prisma.shieldAudit.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'a3' },
          data: expect.objectContaining({
            status: 'FAILED',
            errorMessage: 'Rule engine crashed',
          }),
        }),
      );

      expect(jobService.markFailed).toHaveBeenCalledWith('j3', 'Rule engine crashed');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.SHIELD_AUDIT_FAILED,
        1,
        expect.objectContaining({ auditId: 'a3' }),
      );
    });

    it('should handle AI failure as non-fatal', async () => {
      aiAnalyst.analyze.mockRejectedValue(new Error('AI timeout'));

      await processor.run(
        makeJob({
          tenantId: 1,
          scope: 'FULL',
          auditId: 'a4',
          includeAi: true,
        }),
      );

      expect(prisma.shieldAudit.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );
    });
  });

  // ─── Cron job dispatching ───

  describe('process — cron job', () => {
    it('should skip if shield feature flag is disabled', async () => {
      prisma.featureFlag.findUnique.mockResolvedValue({ enabled: false });

      await processor.run(makeJob({ isCronJob: true }));

      expect(prisma.tenant.findMany).not.toHaveBeenCalled();
      expect(shieldQueue.add).not.toHaveBeenCalled();
    });

    it('should dispatch audits for all active tenants at local 8 AM and stamp each', async () => {
      prisma.featureFlag.findUnique.mockResolvedValue({ enabled: true });
      prisma.tenant.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);

      await processor.run(makeJob({ isCronJob: true }));

      expect(prisma.shieldAudit.create).toHaveBeenCalledTimes(2);
      expect(shieldQueue.add).toHaveBeenCalledTimes(2);
      // Each acted-on tenant gets stamped with its local date.
      expect(tenantJobRun.markRanOn).toHaveBeenCalledTimes(2);
      expect(tenantJobRun.markRanOn).toHaveBeenCalledWith(1, TENANT_JOB_KEYS.SHIELD_AUDIT, '2026-05-29');
      // Dispatched jobs must use the new SAFETY_DETECT job name
      expect(shieldQueue.add).toHaveBeenCalledWith(SAFETY_DETECT_JOB_NAMES.AUDIT, expect.anything());
      // Dispatched payload must be wrapped in a JobEnvelope
      const [, envelope] = shieldQueue.add.mock.calls[0];
      expect(envelope).toEqual(
        expect.objectContaining({
          tenantId: expect.any(String),
          correlationId: expect.any(String),
          metadata: expect.objectContaining({ source: 'cron', version: 1 }),
          payload: expect.objectContaining({ tenantId: 1 }),
        }),
      );
    });

    it('only fans out to tenants at local 8 AM that are not already stamped today', async () => {
      prisma.featureFlag.findUnique.mockResolvedValue({ enabled: true });
      prisma.tenant.findMany.mockResolvedValue([
        // A: local 8 AM, never run → acted on
        { id: 1 },
        // B: local 8 AM, already stamped today → skipped
        { id: 2 },
        // C: local 9 AM → skipped
        { id: 3 },
      ]);
      timezoneService.resolveTenantTimezone.mockImplementation((id: number) =>
        Promise.resolve(id === 1 ? 'America/Chicago' : id === 2 ? 'America/New_York' : 'America/Denver'),
      );
      timezoneService.localHour.mockImplementation((tz: string) =>
        tz === 'America/Denver' ? DIGEST_LOCAL_HOUR + 1 : DIGEST_LOCAL_HOUR,
      );
      timezoneService.localDate.mockReturnValue('2026-05-29');
      // A never run; B already stamped today.
      tenantJobRun.hasRunOn.mockImplementation((tenantId: number) => Promise.resolve(tenantId === 2));

      await processor.run(makeJob({ isCronJob: true }));

      expect(prisma.shieldAudit.create).toHaveBeenCalledTimes(1);
      expect(shieldQueue.add).toHaveBeenCalledTimes(1);
      expect(tenantJobRun.markRanOn).toHaveBeenCalledTimes(1);
      expect(tenantJobRun.markRanOn).toHaveBeenCalledWith(1, TENANT_JOB_KEYS.SHIELD_AUDIT, '2026-05-29');
    });

    it('skips a tenant whose local hour is not the audit hour', async () => {
      prisma.featureFlag.findUnique.mockResolvedValue({ enabled: true });
      prisma.tenant.findMany.mockResolvedValue([{ id: 1 }]);
      timezoneService.localHour.mockReturnValue(DIGEST_LOCAL_HOUR - 1);

      await processor.run(makeJob({ isCronJob: true }));

      expect(prisma.shieldAudit.create).not.toHaveBeenCalled();
      expect(shieldQueue.add).not.toHaveBeenCalled();
      expect(tenantJobRun.markRanOn).not.toHaveBeenCalled();
    });

    it('skips a tenant already stamped for the local day', async () => {
      prisma.featureFlag.findUnique.mockResolvedValue({ enabled: true });
      prisma.tenant.findMany.mockResolvedValue([{ id: 1 }]);
      timezoneService.localHour.mockReturnValue(DIGEST_LOCAL_HOUR);
      timezoneService.localDate.mockReturnValue('2026-05-29');
      tenantJobRun.hasRunOn.mockResolvedValue(true);

      await processor.run(makeJob({ isCronJob: true }));

      expect(prisma.shieldAudit.create).not.toHaveBeenCalled();
      expect(shieldQueue.add).not.toHaveBeenCalled();
      expect(tenantJobRun.markRanOn).not.toHaveBeenCalled();
    });

    it('fans out + stamps when the stamp is an earlier local day', async () => {
      prisma.featureFlag.findUnique.mockResolvedValue({ enabled: true });
      prisma.tenant.findMany.mockResolvedValue([{ id: 1 }]);
      timezoneService.localHour.mockReturnValue(DIGEST_LOCAL_HOUR);
      timezoneService.localDate.mockReturnValue('2026-05-29');
      // Stamp is from an earlier local day → hasRunOn(localDate) is false.
      tenantJobRun.hasRunOn.mockResolvedValue(false);

      await processor.run(makeJob({ isCronJob: true }));

      expect(prisma.shieldAudit.create).toHaveBeenCalledTimes(1);
      expect(shieldQueue.add).toHaveBeenCalledTimes(1);
      expect(tenantJobRun.markRanOn).toHaveBeenCalledWith(1, TENANT_JOB_KEYS.SHIELD_AUDIT, '2026-05-29');
    });
  });

  // ─── Tenant paused ───

  describe('process — tenant paused', () => {
    it('should skip audit if tenant has jobsPaused=true', async () => {
      prisma.tenant.findUnique.mockResolvedValue({ jobsPaused: true });

      await processor.run(
        makeJob({
          tenantId: 1,
          scope: 'FULL',
          auditId: 'a5',
          jobId: 'j5',
        }),
      );

      expect(ruleEngine.checkHOS).not.toHaveBeenCalled();
      expect(jobService.markCompleted).toHaveBeenCalledWith('j5', {
        skipped: 'tenant_paused',
      });
    });
  });

  // ─── Missing tenantId ───

  describe('process — missing tenantId', () => {
    it('should skip if tenantId is missing', async () => {
      await processor.run(makeJob({ scope: 'FULL', auditId: 'a6' }));

      expect(ruleEngine.checkHOS).not.toHaveBeenCalled();
    });
  });

  // ─── Critical findings notification ───

  describe('process — critical findings notification', () => {
    it('should notify users when critical findings exist', async () => {
      const criticalFinding = {
        category: 'DRIVERS',
        severity: 'CRITICAL',
        title: 'CDL Expired',
        description: 'Critical',
      };
      ruleEngine.checkDrivers.mockResolvedValue(baseCategoryResult('DRIVERS', 50, [criticalFinding]));
      prisma.user.findMany.mockResolvedValue([{ id: 10 }, { id: 20 }]);

      await processor.run(
        makeJob({
          tenantId: 1,
          scope: 'FULL',
          auditId: 'a7',
          includeAi: false,
        }),
      );

      expect(notificationService.create).toHaveBeenCalledTimes(2);
      expect(notificationService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SHIELD_AUDIT_CRITICAL',
          tenantId: 1,
        }),
      );
    });

    it('should not notify when no critical findings', async () => {
      const warningFinding = {
        category: 'DRIVERS',
        severity: 'WARNING',
        title: 'CDL expiring soon',
        description: 'Non-critical',
      };
      ruleEngine.checkDrivers.mockResolvedValue(baseCategoryResult('DRIVERS', 80, [warningFinding]));

      await processor.run(
        makeJob({
          tenantId: 1,
          scope: 'FULL',
          auditId: 'a8',
          includeAi: false,
        }),
      );

      expect(notificationService.create).not.toHaveBeenCalled();
    });

    it('should handle notification failure gracefully', async () => {
      const criticalFinding = {
        category: 'HOS',
        severity: 'CRITICAL',
        title: 'Drive hours exceeded',
        description: 'Critical',
      };
      ruleEngine.checkHOS.mockResolvedValue(baseCategoryResult('HOS', 40, [criticalFinding]));
      prisma.user.findMany.mockResolvedValue([{ id: 10 }]);
      notificationService.create.mockRejectedValue(new Error('Notification failed'));

      await processor.run(
        makeJob({
          tenantId: 1,
          scope: 'FULL',
          auditId: 'a9',
          includeAi: false,
        }),
      );

      expect(prisma.shieldAudit.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );
    });
  });

  // ─── AI integration ───

  describe('process — AI integration', () => {
    it('should include AI findings in results', async () => {
      aiAnalyst.analyze.mockResolvedValue({
        response: {
          summary: 'AI detected issues',
          insights: [{ text: 'insight' }],
          priorityActions: [{ action: 'do something' }],
          findings: [
            {
              category: 'DRIVERS',
              severity: 'WARNING',
              title: 'AI finding',
              description: 'AI detected',
            },
          ],
          skippedRules: [],
        },
        modelUsed: 'gpt-4o',
        durationMs: 500,
      });

      await processor.run(
        makeJob({
          tenantId: 1,
          scope: 'FULL',
          auditId: 'a-ai',
          includeAi: true,
        }),
      );

      expect(prisma.shieldFinding.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            source: 'AI',
            title: 'AI finding',
          }),
        ]),
      });

      expect(prisma.shieldAudit.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'COMPLETED',
            aiSummary: 'AI detected issues',
            aiModelUsed: 'gpt-4o',
          }),
        }),
      );
    });

    it('should skip AI for non-FULL scope', async () => {
      await processor.run(
        makeJob({
          tenantId: 1,
          scope: 'DRIVERS',
          auditId: 'a-no-ai',
          includeAi: true,
        }),
      );

      expect(aiAnalyst.analyze).not.toHaveBeenCalled();
    });
  });

  // ─── Cross-entity findings ───

  describe('process — cross-entity', () => {
    it('should include cross-entity findings for FULL scope', async () => {
      const crossFinding = {
        category: 'DRIVERS',
        severity: 'CRITICAL',
        title: 'Hazmat without endorsement',
        description: 'Cross-entity',
      };
      ruleEngine.checkCrossEntity.mockResolvedValue([crossFinding]);

      await processor.run(
        makeJob({
          tenantId: 1,
          scope: 'FULL',
          auditId: 'a-cross',
          includeAi: false,
        }),
      );

      expect(prisma.shieldFinding.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            title: 'Hazmat without endorsement',
          }),
        ]),
      });
    });
  });

  // ─── Conversation follow-up ───

  describe('process — conversation follow-up', () => {
    it('should post result to conversation when conversationId provided', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: 42,
        conversationId: 'conv-1',
      });

      await processor.run(
        makeJob({
          tenantId: 1,
          scope: 'FULL',
          auditId: 'a-conv',
          includeAi: false,
          conversationId: 'conv-1',
        }),
      );

      expect(prisma.conversationMessage.create).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.SHIELD_AUDIT_COMPLETE,
        1,
        expect.objectContaining({
          asyncFollowUp: true,
          conversationId: 'conv-1',
        }),
      );
    });

    it('should handle conversation not found gracefully', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);

      await processor.run(
        makeJob({
          tenantId: 1,
          scope: 'FULL',
          auditId: 'a-conv-miss',
          includeAi: false,
          conversationId: 'conv-nonexistent',
        }),
      );

      expect(prisma.conversationMessage.create).not.toHaveBeenCalled();
    });
  });

  // ─── cancelled-audit guard ───

  describe('process — cancelled guard', () => {
    it('skips a cancelled audit without producing findings', async () => {
      prisma.shieldAudit.findUnique.mockResolvedValueOnce({ status: 'CANCELLED' });

      await processor.run(makeJob({ tenantId: 1, scope: 'FULL', auditId: 'a-cancelled', jobId: 5, includeAi: false }));

      expect(ruleEngine.checkHOS).not.toHaveBeenCalled();
      expect(prisma.shieldFinding.createMany).not.toHaveBeenCalled();
      // Should NOT flip the cancelled audit back to RUNNING.
      expect(prisma.shieldAudit.update).not.toHaveBeenCalled();
      expect(jobService.markCompleted).toHaveBeenCalledWith(5, { skipped: 'cancelled' });
    });

    it('skips when the audit no longer exists', async () => {
      prisma.shieldAudit.findUnique.mockResolvedValueOnce(null);

      await processor.run(makeJob({ tenantId: 1, scope: 'FULL', auditId: 'a-gone', includeAi: false }));

      expect(ruleEngine.checkHOS).not.toHaveBeenCalled();
      expect(prisma.shieldFinding.createMany).not.toHaveBeenCalled();
    });

    it('proceeds normally when the audit is still QUEUED', async () => {
      prisma.shieldAudit.findUnique.mockResolvedValueOnce({ status: 'QUEUED' });

      await processor.run(makeJob({ tenantId: 1, scope: 'FULL', auditId: 'a-ok', includeAi: false }));

      expect(ruleEngine.checkHOS).toHaveBeenCalled();
    });
  });

  // Job-name routing and dead-letter persistence now live in the single
  // SafetyDetectQueueProcessor dispatcher, not on this handler.
  describe('handler registration', () => {
    it('owns the AUDIT job name so the dispatcher can route to it', () => {
      expect(processor.jobNames).toContain(SAFETY_DETECT_JOB_NAMES.AUDIT);
    });
  });
});
