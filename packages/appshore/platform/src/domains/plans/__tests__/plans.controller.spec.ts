import { ForbiddenException } from '@nestjs/common';
import { fieldErrorsOf, readBodyDto } from '../../../test/helpers/field-errors.helpers';
import { AssignTenantPlanDto, UpdateProviderPriceDto } from '../dto/assign-plan.dto';
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

  it('getMyPlan answers 403 NO_TENANT without a workspace: no field of the request is at fault', async () => {
    const error = await controller.getMyPlan({}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toMatchObject({ code: 'NO_TENANT' });
    expect(service.getTenantPlanDetails).not.toHaveBeenCalled();
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
    await controller.toggleEntitlement('STARTER', 'reports', {
      enabled: false,
    });
    expect(service.toggleEntitlement).toHaveBeenCalledWith('STARTER', 'reports', false);
  });

  it('the assign-plan body names a plan that exists, and refuses an undeclared field', async () => {
    expect(await readBodyDto(AssignTenantPlanDto, { plan: 'PROFESSIONAL', reason: 'Upgrade' })).toEqual({
      plan: 'PROFESSIONAL',
      reason: 'Upgrade',
    });
    expect(await fieldErrorsOf(readBodyDto(AssignTenantPlanDto, { plan: 'GOLD' }))).toHaveProperty('plan');
    expect(await fieldErrorsOf(readBodyDto(AssignTenantPlanDto, {}))).toHaveProperty('plan');
    expect(await fieldErrorsOf(readBodyDto(AssignTenantPlanDto, { plan: 'PROFESSIONAL', status: 'x' }))).toHaveProperty(
      'status',
    );
  });

  it('the provider-price body takes a price id or null, and nothing else', async () => {
    expect(await readBodyDto(UpdateProviderPriceDto, { providerPriceId: 'price_123' })).toEqual({
      providerPriceId: 'price_123',
    });
    expect(await readBodyDto(UpdateProviderPriceDto, { providerPriceId: null })).toEqual({ providerPriceId: null });
    expect(await fieldErrorsOf(readBodyDto(UpdateProviderPriceDto, {}))).toHaveProperty('providerPriceId');
    expect(await fieldErrorsOf(readBodyDto(UpdateProviderPriceDto, { providerPriceId: 42 }))).toHaveProperty(
      'providerPriceId',
    );
  });
});
