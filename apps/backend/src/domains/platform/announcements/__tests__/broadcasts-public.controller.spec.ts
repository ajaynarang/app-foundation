import { BroadcastsPublicController } from '../broadcasts-public.controller';

describe('BroadcastsPublicController', () => {
  let controller: BroadcastsPublicController;
  let service: any;

  const mockBroadcasts = [{ id: 1, title: 'Maintenance', status: 'PUBLISHED' }];

  beforeEach(() => {
    service = {
      findActiveForTenant: jest.fn().mockResolvedValue(mockBroadcasts),
      findActiveForAllOnly: jest.fn().mockResolvedValue(mockBroadcasts),
    };
    controller = new BroadcastsPublicController(service);
  });

  describe('findActive', () => {
    it('should call findActiveForTenant when user has tenantId', () => {
      const user = { tenantId: 'tenant_abc', planSlug: 'pro' };

      const result = controller.findActive(user);

      expect(service.findActiveForTenant).toHaveBeenCalledWith('tenant_abc', 'pro');
      expect(result).toBeDefined();
    });

    it('should call findActiveForAllOnly when user has no tenantId (SUPER_ADMIN)', () => {
      const user = { tenantId: undefined, planSlug: undefined };

      const result = controller.findActive(user);

      expect(service.findActiveForAllOnly).toHaveBeenCalled();
      expect(service.findActiveForTenant).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should call findActiveForAllOnly when tenantId is null', () => {
      const user = { tenantId: null, planSlug: null };

      controller.findActive(user);

      expect(service.findActiveForAllOnly).toHaveBeenCalled();
      expect(service.findActiveForTenant).not.toHaveBeenCalled();
    });

    it('should pass planSlug to findActiveForTenant', () => {
      const user = { tenantId: 'tenant_xyz', planSlug: 'enterprise' };

      controller.findActive(user);

      expect(service.findActiveForTenant).toHaveBeenCalledWith('tenant_xyz', 'enterprise');
    });
  });
});
