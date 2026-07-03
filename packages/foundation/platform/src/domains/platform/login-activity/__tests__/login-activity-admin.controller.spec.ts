import { Test } from '@nestjs/testing';
import { LoginActivityAdminController } from '../login-activity-admin.controller';
import { LoginActivityService } from '../login-activity.service';

describe('LoginActivityAdminController (super admin)', () => {
  let controller: LoginActivityAdminController;
  let serviceList: jest.Mock;
  let serviceSummary: jest.Mock;

  beforeEach(async () => {
    serviceList = jest.fn().mockResolvedValue({ items: [], total: 0, limit: 50, offset: 0 });
    serviceSummary = jest.fn().mockResolvedValue({
      kpis: { totalSignIns: 0, failedAttempts: 0, failedDeltaPct: 0, uniqueUsers: 0, uniqueIps: 0 },
      notable: { bruteForceSuspects: [], newIpSignIns: [], offHoursSignIns: [] },
      timezoneUsed: 'UTC',
    });
    const moduleRef = await Test.createTestingModule({
      controllers: [LoginActivityAdminController],
      providers: [{ provide: LoginActivityService, useValue: { list: serviceList, summary: serviceSummary } }],
    }).compile();
    controller = moduleRef.get(LoginActivityAdminController);
  });

  it('list: passes super-admin scope and forwards tenantId filter', async () => {
    await controller.list({ from: '2026-05-19', to: '2026-05-26', tenantId: 42 });
    const [scope, params] = serviceList.mock.calls[0];
    expect(scope).toEqual({ isSuperAdmin: true, tenantId: 42 });
    expect(params.tenantId).toBe(42);
  });

  it('list: super-admin scope without tenantId means cross-tenant', async () => {
    await controller.list({ from: '2026-05-19', to: '2026-05-26' });
    const [scope] = serviceList.mock.calls[0];
    expect(scope).toEqual({ isSuperAdmin: true, tenantId: undefined });
  });

  it('summary: passes super-admin scope', async () => {
    await controller.summary({ from: '2026-05-19', to: '2026-05-26', tenantId: 42 });
    expect(serviceSummary).toHaveBeenCalledTimes(1);
    const [scope] = serviceSummary.mock.calls[0];
    expect(scope.isSuperAdmin).toBe(true);
    expect(scope.tenantId).toBe(42);
  });
});
