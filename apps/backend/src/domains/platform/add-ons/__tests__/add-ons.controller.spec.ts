import { BadRequestException } from '@nestjs/common';
import { AddOnsController } from '../add-ons.controller';

describe('AddOnsController', () => {
  let controller: AddOnsController;
  let service: any;

  const userWithTenant = { tenantDbId: 1, dbId: 10, email: 'admin@test.com' };
  const userWithoutTenant = { dbId: 10 };

  beforeEach(() => {
    service = {
      getAddOnsForPricingPage: jest.fn().mockResolvedValue([]),
      listTenantAddOns: jest.fn().mockResolvedValue([]),
      listMyRequests: jest.fn().mockResolvedValue([]),
      getAddOnStatus: jest.fn().mockResolvedValue({ hasAccess: true }),
      createRequest: jest.fn().mockResolvedValue({ id: 1 }),
      activateAddOn: jest.fn().mockResolvedValue({ id: 1, status: 'active' }),
      toggleOverage: jest.fn().mockResolvedValue({ overageEnabled: true }),
      cancelAddOn: jest.fn().mockResolvedValue({ status: 'cancelled' }),
    };
    controller = new AddOnsController(service);
  });

  it('listAddOns calls getAddOnsForPricingPage', async () => {
    await controller.listAddOns();
    expect(service.getAddOnsForPricingPage).toHaveBeenCalled();
  });

  it('getMyAddOns throws without tenant', async () => {
    await expect(controller.getMyAddOns(userWithoutTenant)).rejects.toThrow(BadRequestException);
  });

  it('getMyAddOns delegates to service', async () => {
    await controller.getMyAddOns(userWithTenant);
    expect(service.listTenantAddOns).toHaveBeenCalledWith(1);
  });

  it('getMyRequests throws without tenant', async () => {
    await expect(controller.getMyRequests(userWithoutTenant)).rejects.toThrow(BadRequestException);
  });

  it('getMyRequests delegates to service', async () => {
    await controller.getMyRequests(userWithTenant);
    expect(service.listMyRequests).toHaveBeenCalledWith(1);
  });

  it('getAddOnStatus throws without tenant', async () => {
    await expect(controller.getAddOnStatus('edi', userWithoutTenant)).rejects.toThrow(BadRequestException);
  });

  it('getAddOnStatus delegates to service', async () => {
    await controller.getAddOnStatus('edi', userWithTenant);
    expect(service.getAddOnStatus).toHaveBeenCalledWith(1, 'edi');
  });

  it('requestAddOn throws without tenant or dbId', async () => {
    await expect(controller.requestAddOn('edi', {} as any, userWithoutTenant)).rejects.toThrow(BadRequestException);
  });

  it('requestAddOn delegates to service', async () => {
    await controller.requestAddOn('edi', { note: 'Please' } as any, userWithTenant);
    expect(service.createRequest).toHaveBeenCalledWith(1, 'edi', 10, 'Please');
  });

  it('activateAddOn throws without tenant', async () => {
    await expect(controller.activateAddOn('edi', userWithoutTenant)).rejects.toThrow(BadRequestException);
  });

  it('activateAddOn delegates to service', async () => {
    await controller.activateAddOn('edi', userWithTenant);
    expect(service.activateAddOn).toHaveBeenCalledWith(1, 'edi', 'purchased', 'admin@test.com');
  });

  it('toggleOverage throws without tenant', async () => {
    await expect(controller.toggleOverage('edi', { enabled: true } as any, userWithoutTenant)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('toggleOverage delegates to service', async () => {
    await controller.toggleOverage('edi', { enabled: true } as any, userWithTenant);
    expect(service.toggleOverage).toHaveBeenCalledWith(1, 'edi', true, 'admin@test.com');
  });

  it('cancelAddOn throws without tenant', async () => {
    await expect(controller.cancelAddOn('edi', userWithoutTenant)).rejects.toThrow(BadRequestException);
  });

  it('cancelAddOn delegates to service', async () => {
    await controller.cancelAddOn('edi', userWithTenant);
    expect(service.cancelAddOn).toHaveBeenCalledWith(1, 'edi', 10);
  });
});
