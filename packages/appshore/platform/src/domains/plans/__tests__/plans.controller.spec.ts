import { BadRequestException } from '@nestjs/common';
import { PlansController } from '../plans.controller';

describe('PlansController', () => {
  let controller: PlansController;
  let service: any;

  beforeEach(() => {
    service = {
      getAllPlanConfigs: jest.fn().mockResolvedValue([]),
      getTenantPlanDetails: jest.fn().mockResolvedValue({ plan: 'STARTER' }),
      assignPlan: jest.fn().mockResolvedValue({ plan: 'PROFESSIONAL' }),
      updateProviderPriceId: jest.fn().mockResolvedValue({}),
      updatePlanConfig: jest.fn().mockResolvedValue({}),
      toggleEntitlement: jest.fn().mockResolvedValue({}),
    };
    controller = new PlansController(service);
  });

  it('getAllPlans delegates to service', async () => {
    await controller.getAllPlans();
    expect(service.getAllPlanConfigs).toHaveBeenCalled();
  });

  it('getMyPlan throws without tenantId', async () => {
    await expect(controller.getMyPlan({})).rejects.toThrow(BadRequestException);
  });

  it('getMyPlan delegates to service', async () => {
    await controller.getMyPlan({ tenantId: 'tenant_abc' });
    expect(service.getTenantPlanDetails).toHaveBeenCalledWith('tenant_abc');
  });

  it('getTenantPlan delegates to service', async () => {
    await controller.getTenantPlan('tenant_abc');
    expect(service.getTenantPlanDetails).toHaveBeenCalledWith('tenant_abc');
  });

  it('assignPlan delegates to service', async () => {
    await controller.assignPlan('tenant_abc', { plan: 'PROFESSIONAL', reason: 'Upgrade' }, { email: 'admin@test.com' });
    expect(service.assignPlan).toHaveBeenCalledWith('tenant_abc', 'PROFESSIONAL', 'admin@test.com', 'Upgrade');
  });

  it('assignPlan uses userId fallback when no email', async () => {
    await controller.assignPlan('tenant_abc', { plan: 'PROFESSIONAL' }, { userId: 'user_1' });
    expect(service.assignPlan).toHaveBeenCalledWith('tenant_abc', 'PROFESSIONAL', 'user_1', undefined);
  });

  it('updateProviderPrice delegates to service', async () => {
    await controller.updateProviderPrice('STARTER', {
      providerPriceId: 'price_123',
    });
    expect(service.updateProviderPriceId).toHaveBeenCalledWith('STARTER', 'price_123');
  });

  it('updatePlanConfig delegates to service', async () => {
    await controller.updatePlanConfig('STARTER', { displayName: 'New' });
    expect(service.updatePlanConfig).toHaveBeenCalledWith('STARTER', {
      displayName: 'New',
    });
  });

  it('toggleEntitlement delegates to service', async () => {
    await controller.toggleEntitlement('STARTER', 'shield', {
      enabled: false,
    });
    expect(service.toggleEntitlement).toHaveBeenCalledWith('STARTER', 'shield', false);
  });
});
