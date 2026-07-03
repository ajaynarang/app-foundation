import { SuperAdminPreferencesController } from '../super-admin-preferences.controller';

describe('SuperAdminPreferencesController', () => {
  let controller: SuperAdminPreferencesController;
  let service: any;

  const mockUser = { userId: 'user_superadmin1' };
  const mockPreferences = { dashboardLayout: 'compact', timezone: 'UTC' };

  beforeEach(() => {
    service = {
      getPreferences: jest.fn().mockResolvedValue(mockPreferences),
      updatePreferences: jest.fn().mockResolvedValue({ ...mockPreferences, timezone: 'US/Eastern' }),
    };
    controller = new SuperAdminPreferencesController(service);
  });

  describe('getPreferences', () => {
    it('should delegate to service with userId', async () => {
      const result = await controller.getPreferences(mockUser);
      expect(service.getPreferences).toHaveBeenCalledWith('user_superadmin1');
      expect(result).toEqual(mockPreferences);
    });
  });

  describe('updatePreferences', () => {
    it('should delegate to service with userId and dto', async () => {
      const dto = { timezone: 'US/Eastern' };
      const result = await controller.updatePreferences(mockUser, dto as any);
      expect(service.updatePreferences).toHaveBeenCalledWith('user_superadmin1', dto);
      expect(result).toEqual({ ...mockPreferences, timezone: 'US/Eastern' });
    });
  });
});
