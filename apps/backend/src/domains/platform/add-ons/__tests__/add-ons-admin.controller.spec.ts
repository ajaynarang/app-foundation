import { AddOnsAdminController, AddOnsCatalogAdminController } from '../add-ons-admin.controller';

describe('AddOnsAdminController', () => {
  let controller: AddOnsAdminController;
  let service: any;

  beforeEach(() => {
    service = {
      listTenantAddOns: jest.fn().mockResolvedValue([{ id: 1, slug: 'edi' }]),
      activateAddOn: jest.fn().mockResolvedValue({ id: 1, status: 'ACTIVE' }),
      cancelAddOn: jest.fn().mockResolvedValue({ id: 1, status: 'CANCELLED' }),
    };
    controller = new AddOnsAdminController(service);
  });

  describe('listTenantAddOns', () => {
    it('should delegate to service with parsed tenantId', async () => {
      const result = await controller.listTenantAddOns(42);
      expect(service.listTenantAddOns).toHaveBeenCalledWith(42);
      expect(result).toEqual([{ id: 1, slug: 'edi' }]);
    });
  });

  describe('enableAddOn', () => {
    it('should delegate to activateAddOn with user email', async () => {
      const user = { email: 'admin@test.com', userId: 'user-1' };
      const body = { priceCents: 5000 };

      const result = await controller.enableAddOn(1, 'edi', body as any, user);

      expect(service.activateAddOn).toHaveBeenCalledWith(1, 'edi', 'admin', 'admin@test.com', 5000);
      expect(result).toEqual({ id: 1, status: 'ACTIVE' });
    });

    it('should use userId when email is absent', async () => {
      const user = { userId: 'user-1' };
      const body = { priceCents: 3000 };

      await controller.enableAddOn(2, 'shield', body as any, user);

      expect(service.activateAddOn).toHaveBeenCalledWith(2, 'shield', 'admin', 'user-1', 3000);
    });
  });

  describe('cancelAddOn', () => {
    it('should delegate to cancelAddOn with user email and reason', async () => {
      const user = { email: 'admin@test.com', userId: 'user-1' };
      const body = { reason: 'No longer needed' };

      const result = await controller.cancelAddOn(1, 'edi', body as any, user);

      expect(service.cancelAddOn).toHaveBeenCalledWith(1, 'edi', 'admin@test.com', 'No longer needed');
      expect(result).toEqual({ id: 1, status: 'CANCELLED' });
    });

    it('should use userId when email is absent', async () => {
      const user = { userId: 'user-1' };
      const body = { reason: 'Cost' };

      await controller.cancelAddOn(3, 'shield', body as any, user);

      expect(service.cancelAddOn).toHaveBeenCalledWith(3, 'shield', 'user-1', 'Cost');
    });
  });
});

describe('AddOnsCatalogAdminController', () => {
  let controller: AddOnsCatalogAdminController;
  let service: any;

  beforeEach(() => {
    service = {
      listAllAddOns: jest.fn().mockResolvedValue([{ slug: 'edi' }]),
      updateProviderPriceId: jest.fn().mockResolvedValue({ slug: 'edi', providerPriceId: 'price_123' }),
      updateAddOn: jest.fn().mockResolvedValue({ slug: 'edi', name: 'Updated' }),
    };
    controller = new AddOnsCatalogAdminController(service);
  });

  describe('listCatalog', () => {
    it('should delegate to listAllAddOns', async () => {
      const result = await controller.listCatalog();
      expect(service.listAllAddOns).toHaveBeenCalled();
      expect(result).toEqual([{ slug: 'edi' }]);
    });
  });

  describe('updateProviderPrice', () => {
    it('should delegate to updateProviderPriceId', async () => {
      const result = await controller.updateProviderPrice('edi', {
        providerPriceId: 'price_123',
      });
      expect(service.updateProviderPriceId).toHaveBeenCalledWith('edi', 'price_123');
      expect(result).toEqual({ slug: 'edi', providerPriceId: 'price_123' });
    });

    it('should pass null to clear providerPriceId', async () => {
      await controller.updateProviderPrice('edi', {
        providerPriceId: null,
      });
      expect(service.updateProviderPriceId).toHaveBeenCalledWith('edi', null);
    });
  });

  describe('updateAddOn', () => {
    it('should delegate to updateAddOn with body', async () => {
      const body = { name: 'Updated', isActive: false };
      const result = await controller.updateAddOn('edi', body as any);
      expect(service.updateAddOn).toHaveBeenCalledWith('edi', body);
      expect(result).toEqual({ slug: 'edi', name: 'Updated' });
    });
  });
});
