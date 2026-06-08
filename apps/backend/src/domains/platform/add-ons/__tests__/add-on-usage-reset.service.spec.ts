import { Test, TestingModule } from '@nestjs/testing';
import { AddOnUsageResetService } from '../add-on-usage-reset.service';
import { AddOnsService } from '../add-ons.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { TimezoneService } from '../../../../shared/services/timezone.service';
import { FINANCE_JOB_NAMES } from '../../../../infrastructure/queue/queue.constants';

describe('AddOnUsageResetService', () => {
  let service: AddOnUsageResetService;
  let addOnsService: any;
  let prisma: any;
  let timezoneService: any;

  beforeEach(async () => {
    addOnsService = {
      resetMonthlyUsageForTenant: jest.fn().mockResolvedValue({ reset: 2 }),
    };
    prisma = {
      tenant: { findMany: jest.fn().mockResolvedValue([]) },
    };
    timezoneService = {
      resolveTenantTimezone: jest.fn().mockResolvedValue('UTC'),
      localDayOfMonth: jest.fn().mockReturnValue(1),
      localDate: jest.fn().mockReturnValue('2026-06-01'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AddOnUsageResetService,
        { provide: AddOnsService, useValue: addOnsService },
        { provide: PrismaService, useValue: prisma },
        { provide: TimezoneService, useValue: timezoneService },
      ],
    }).compile();

    service = module.get<AddOnUsageResetService>(AddOnUsageResetService);
  });

  describe('run', () => {
    it('should call handleUsageReset when job name matches', async () => {
      prisma.tenant.findMany.mockResolvedValue([{ id: 5 }]);
      const job = { name: FINANCE_JOB_NAMES.ADDON_USAGE_RESET } as any;

      const result = await service.run(job);

      expect(addOnsService.resetMonthlyUsageForTenant).toHaveBeenCalled();
      expect(result).toEqual({ reset: 2 });
    });
  });

  describe('handleUsageReset', () => {
    it('only loads ACTIVE, non-paused tenants', async () => {
      prisma.tenant.findMany.mockResolvedValue([]);

      await service.handleUsageReset();

      expect(prisma.tenant.findMany).toHaveBeenCalledWith({
        where: { status: 'ACTIVE', jobsPaused: false },
        select: { id: true },
      });
    });

    it('resets only tenants where it is the local 1st-of-month', async () => {
      prisma.tenant.findMany.mockResolvedValue([{ id: 5 }, { id: 6 }, { id: 7 }]);
      // tenant 5 → Chicago, local day 1; tenant 6 → Auckland, local day 1; tenant 7 → Honolulu, local day 31
      timezoneService.resolveTenantTimezone
        .mockResolvedValueOnce('America/Chicago')
        .mockResolvedValueOnce('Pacific/Auckland')
        .mockResolvedValueOnce('Pacific/Honolulu');
      timezoneService.localDayOfMonth.mockReturnValueOnce(1).mockReturnValueOnce(1).mockReturnValueOnce(31);
      timezoneService.localDate.mockReturnValueOnce('2026-06-01').mockReturnValueOnce('2026-06-01');
      addOnsService.resetMonthlyUsageForTenant.mockResolvedValueOnce({ reset: 3 }).mockResolvedValueOnce({ reset: 1 });

      const result = await service.handleUsageReset();

      // Only tenants 5 and 6 acted upon (tenant 7 is not on its local 1st)
      expect(addOnsService.resetMonthlyUsageForTenant).toHaveBeenCalledTimes(2);
      expect(addOnsService.resetMonthlyUsageForTenant).toHaveBeenNthCalledWith(
        1,
        5,
        new Date('2026-06-01T00:00:00.000Z'),
      );
      expect(addOnsService.resetMonthlyUsageForTenant).toHaveBeenNthCalledWith(
        2,
        6,
        new Date('2026-06-01T00:00:00.000Z'),
      );
      expect(result).toEqual({ reset: 4 });
    });

    it('skips every tenant when none are on their local 1st', async () => {
      prisma.tenant.findMany.mockResolvedValue([{ id: 5 }]);
      timezoneService.localDayOfMonth.mockReturnValue(15);

      const result = await service.handleUsageReset();

      expect(addOnsService.resetMonthlyUsageForTenant).not.toHaveBeenCalled();
      expect(result).toEqual({ reset: 0 });
    });
  });
});
