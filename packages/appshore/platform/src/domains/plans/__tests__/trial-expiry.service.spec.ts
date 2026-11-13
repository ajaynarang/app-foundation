import { TrialExpiryService } from '../trial-expiry.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { Logger } from '@nestjs/common';
import { currentRls } from '@appshore/kernel/infrastructure/rls/rls-context';
import * as errorTracking from '@appshore/kernel/infrastructure/error-tracking/sentry';

describe('TrialExpiryService', () => {
  let service: TrialExpiryService;
  let prisma: any;

  const mockTenant = {
    id: 1,
    tenantId: 'tenant_abc',
    companyName: 'TestCo',
    plan: 'TRIAL',
  };

  beforeEach(() => {
    const txMock = {
      tenant: { update: jest.fn().mockResolvedValue({}) },
      tenantPlanEvent: { create: jest.fn().mockResolvedValue({}) },
      tenantAddOn: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };

    prisma = {
      tenant: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn().mockImplementation((fn) => fn(txMock)),
    };

    service = new TrialExpiryService(prisma);
  });

  describe('run', () => {
    it('should call expireTrials for TRIAL_EXPIRY job', async () => {
      const spy = jest.spyOn(service, 'expireTrials').mockResolvedValue({ expired: 0 });
      const job = { name: 'trial-expiry' } as any;
      await service.run(job);
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('expireTrials', () => {
    it('should return 0 when no expired trials found', async () => {
      prisma.tenant.findMany.mockResolvedValue([]);
      const result = await service.expireTrials();
      expect(result.expired).toBe(0);
    });

    it('should expire trials and create events', async () => {
      prisma.tenant.findMany.mockResolvedValue([mockTenant]);
      const result = await service.expireTrials();
      expect(result.expired).toBe(1);
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should continue processing if one tenant fails', async () => {
      prisma.tenant.findMany.mockResolvedValue([mockTenant, { ...mockTenant, id: 2, tenantId: 'tenant_def' }]);
      prisma.$transaction.mockRejectedValueOnce(new Error('DB error')).mockImplementation((fn) =>
        fn({
          tenant: { update: jest.fn() },
          tenantPlanEvent: { create: jest.fn() },
          tenantAddOn: { updateMany: jest.fn() },
        }),
      );

      const result = await service.expireTrials();
      expect(result.expired).toBe(1);
    });

    it('counts the run as one CronRun: the failed tenant is reported and the completion line carries both counts', async () => {
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const reportSpy = jest.spyOn(errorTracking, 'reportError').mockImplementation(() => undefined);
      prisma.tenant.findMany.mockResolvedValue([mockTenant, { ...mockTenant, id: 2, tenantId: 'tenant_def' }]);
      const failure = new Error('DB error');
      prisma.$transaction.mockRejectedValueOnce(failure);

      await service.expireTrials();

      expect(reportSpy).toHaveBeenCalledWith(failure, expect.objectContaining({ tenantDbId: 1, source: 'cron' }));
      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'cron.completed', jobName: 'trial-expiry', tenantsOk: 1, tenantsFailed: 1 }),
      );
      jest.restoreAllMocks();
    });

    it('writes a completion line when no trial has ended, so cron-missed sees the run', async () => {
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

      await service.expireTrials();

      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'cron.completed', jobName: 'trial-expiry' }),
      );
      jest.restoreAllMocks();
    });
  });

  describe('tenant context', () => {
    it('lists tenants as declared cross-tenant work and expires each one as its own tenant', async () => {
      const seen: unknown[] = [];
      prisma.tenant.findMany.mockImplementation(async () => {
        seen.push(currentRls());
        return [mockTenant, { ...mockTenant, id: 2, tenantId: 'tenant_def' }];
      });
      prisma.$transaction.mockImplementation(async () => {
        seen.push(currentRls());
      });
      await service.expireTrials();
      expect(seen).toEqual([
        { kind: 'system', reason: 'cron.trial-expiry' },
        { kind: 'tenant', tenantId: 1, source: 'cron:cron.trial-expiry' },
        { kind: 'tenant', tenantId: 2, source: 'cron:cron.trial-expiry' },
      ]);
    });
  });
});
