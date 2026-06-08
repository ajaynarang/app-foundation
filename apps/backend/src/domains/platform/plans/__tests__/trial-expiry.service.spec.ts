import { TrialExpiryService } from '../trial-expiry.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { FINANCE_JOB_NAMES } from '../../../../infrastructure/queue/queue.constants';

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
      alert: { create: jest.fn().mockResolvedValue({}) },
    };

    prisma = {
      tenant: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn().mockImplementation((fn) => fn(txMock)),
    };

    service = new TrialExpiryService(prisma as unknown as PrismaService);
  });

  describe('run', () => {
    it('should call expireTrials for TRIAL_EXPIRY job', async () => {
      const spy = jest.spyOn(service, 'expireTrials').mockResolvedValue({ expired: 0 });
      const job = { name: FINANCE_JOB_NAMES.TRIAL_EXPIRY } as any;
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
          alert: { create: jest.fn() },
        }),
      );

      const result = await service.expireTrials();
      expect(result.expired).toBe(1);
    });
  });
});
