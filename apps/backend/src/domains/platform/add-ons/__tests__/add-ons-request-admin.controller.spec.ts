import { AddOnsRequestAdminController } from '../add-ons-request-admin.controller';

describe('AddOnsRequestAdminController', () => {
  let controller: AddOnsRequestAdminController;
  let service: any;

  beforeEach(() => {
    service = {
      listRequests: jest.fn().mockResolvedValue([{ id: 'req-1' }]),
      approveRequest: jest.fn().mockResolvedValue({ id: 'req-1', status: 'APPROVED' }),
      declineRequest: jest.fn().mockResolvedValue({ id: 'req-1', status: 'DECLINED' }),
      listTenantAddOns: jest.fn().mockResolvedValue([{ slug: 'edi' }]),
      cancelAddOn: jest.fn().mockResolvedValue({ status: 'CANCELLED' }),
      activateAddOn: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
    };
    controller = new AddOnsRequestAdminController(service);
  });

  describe('listRequests', () => {
    it('should delegate to service without status filter', async () => {
      const result = await controller.listRequests();
      expect(service.listRequests).toHaveBeenCalledWith(undefined);
      expect(result).toEqual([{ id: 'req-1' }]);
    });

    it('should delegate to service with status filter', async () => {
      await controller.listRequests('PENDING');
      expect(service.listRequests).toHaveBeenCalledWith('PENDING');
    });

    it('should pass approved status filter', async () => {
      await controller.listRequests('APPROVED');
      expect(service.listRequests).toHaveBeenCalledWith('APPROVED');
    });

    it('should pass declined status filter', async () => {
      await controller.listRequests('DECLINED');
      expect(service.listRequests).toHaveBeenCalledWith('DECLINED');
    });
  });

  describe('approveRequest', () => {
    it('should delegate to service with user dbId', async () => {
      const user = { dbId: 99 };
      const body = { giftedPriceCents: 0 };

      const result = await controller.approveRequest('req-1', body as any, user);

      expect(service.approveRequest).toHaveBeenCalledWith('req-1', 99, 0);
      expect(result).toEqual({ id: 'req-1', status: 'APPROVED' });
    });

    it('should pass undefined giftedPriceCents when not provided', async () => {
      const user = { dbId: 99 };
      const body = {};

      await controller.approveRequest('req-1', body as any, user);

      expect(service.approveRequest).toHaveBeenCalledWith('req-1', 99, undefined);
    });
  });

  describe('declineRequest', () => {
    it('should delegate to service with reason', async () => {
      const user = { dbId: 99 };
      const body = { reason: 'Budget constraints' };

      const result = await controller.declineRequest('req-1', body as any, user);

      expect(service.declineRequest).toHaveBeenCalledWith('req-1', 99, 'Budget constraints');
      expect(result).toEqual({ id: 'req-1', status: 'DECLINED' });
    });
  });

  describe('listTenantAddOns', () => {
    it('should parse tenantId to integer and delegate', async () => {
      const result = await controller.listTenantAddOns('42');
      expect(service.listTenantAddOns).toHaveBeenCalledWith(42);
      expect(result).toEqual([{ slug: 'edi' }]);
    });
  });

  describe('cancelAddOn', () => {
    it('should parse tenantId and delegate with user dbId and reason', async () => {
      const user = { dbId: 99 };
      const body = { reason: 'Revoked' };

      const result = await controller.cancelAddOn('42', 'edi', body as any, user);

      expect(service.cancelAddOn).toHaveBeenCalledWith(42, 'edi', 99, 'Revoked');
      expect(result).toEqual({ status: 'CANCELLED' });
    });
  });

  describe('activateAddOn', () => {
    it('should activate as gifted when giftedPriceCents is provided', async () => {
      const user = { dbId: 99 };
      const body = { giftedPriceCents: 0 };

      const result = await controller.activateAddOn('42', 'edi', body as any, user);

      expect(service.activateAddOn).toHaveBeenCalledWith(42, 'edi', 'gifted', 99, 0);
      expect(result).toEqual({ status: 'ACTIVE' });
    });

    it('should activate as purchased when giftedPriceCents is undefined', async () => {
      const user = { dbId: 99 };
      const body = {};

      await controller.activateAddOn('42', 'edi', body as any, user);

      expect(service.activateAddOn).toHaveBeenCalledWith(42, 'edi', 'purchased', 99, undefined);
    });
  });
});
