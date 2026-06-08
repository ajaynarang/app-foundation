import { Test } from '@nestjs/testing';
import { LoginActivityController } from '../login-activity.controller';
import { LoginActivityService } from '../login-activity.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

describe('LoginActivityController (tenant)', () => {
  let controller: LoginActivityController;
  let serviceList: jest.Mock;
  let serviceSummary: jest.Mock;
  let prismaTenantFindUnique: jest.Mock;

  beforeEach(async () => {
    serviceList = jest.fn().mockResolvedValue({ items: [], total: 0, limit: 50, offset: 0 });
    serviceSummary = jest.fn().mockResolvedValue({
      kpis: { totalSignIns: 0, failedAttempts: 0, failedDeltaPct: 0, uniqueUsers: 0, uniqueIps: 0 },
      notable: { bruteForceSuspects: [], newIpSignIns: [], offHoursSignIns: [] },
      timezoneUsed: 'UTC',
    });
    prismaTenantFindUnique = jest.fn().mockResolvedValue({ id: 1 }); // BaseTenantController.getTenantDbId reads this

    const moduleRef = await Test.createTestingModule({
      controllers: [LoginActivityController],
      providers: [
        { provide: LoginActivityService, useValue: { list: serviceList, summary: serviceSummary } },
        { provide: PrismaService, useValue: { tenant: { findUnique: prismaTenantFindUnique } } },
      ],
    }).compile();

    controller = moduleRef.get(LoginActivityController);
  });

  it('calls service.list with caller tenant scope', async () => {
    const user = { tenantId: 'acme', userId: 'u1' };
    await controller.list(user as any, { from: '2026-05-19', to: '2026-05-26' } as any);
    expect(serviceList).toHaveBeenCalledTimes(1);
    const [scope] = serviceList.mock.calls[0];
    expect(scope).toEqual({ isSuperAdmin: false, tenantId: 1 });
  });

  it('ignores client-supplied tenantId in the query', async () => {
    const user = { tenantId: 'acme', userId: 'u1' };
    await controller.list(user as any, { from: '2026-05-19', to: '2026-05-26', tenantId: 9999 } as any);
    const [, params] = serviceList.mock.calls[0];
    expect(params.tenantId).toBeUndefined();
  });

  it('calls service.summary with caller tenant scope', async () => {
    const user = { tenantId: 'acme', userId: 'u1' };
    await controller.summary(user as any, { from: '2026-05-19', to: '2026-05-26' } as any);
    expect(serviceSummary).toHaveBeenCalledTimes(1);
    const [scope] = serviceSummary.mock.calls[0];
    expect(scope.isSuperAdmin).toBe(false);
    expect(scope.tenantId).toBe(1);
  });
});
