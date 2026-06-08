import { OperationsSettingsController } from '../operations-settings.controller';

describe('OperationsSettingsController', () => {
  let controller: OperationsSettingsController;
  let service: any;

  const mockUser = { tenantDbId: 42 };
  const mockSettings = { autoAssign: true, maxStops: 5 };
  const mockDefaults = { autoAssign: false, maxStops: 3 };

  beforeEach(() => {
    service = {
      getSettings: jest.fn().mockResolvedValue(mockSettings),
      updateSettings: jest.fn().mockResolvedValue({ ...mockSettings, autoAssign: false }),
      resetToDefaults: jest.fn().mockResolvedValue(mockDefaults),
      getDefaults: jest.fn().mockReturnValue(mockDefaults),
    };
    controller = new OperationsSettingsController(service);
  });

  describe('getSettings', () => {
    it('should delegate to service with tenantDbId', async () => {
      const result = await controller.getSettings(mockUser);
      expect(service.getSettings).toHaveBeenCalledWith(42);
      expect(result).toEqual(mockSettings);
    });
  });

  describe('updateSettings', () => {
    it('should delegate to service with tenantDbId and dto', async () => {
      const dto = { autoAssign: false };
      const result = await controller.updateSettings(mockUser, dto as any);
      expect(service.updateSettings).toHaveBeenCalledWith(42, dto);
      expect(result).toEqual({ ...mockSettings, autoAssign: false });
    });
  });

  describe('resetToDefaults', () => {
    it('should delegate to service with tenantDbId', async () => {
      const result = await controller.resetToDefaults(mockUser);
      expect(service.resetToDefaults).toHaveBeenCalledWith(42);
      expect(result).toEqual(mockDefaults);
    });
  });

  describe('getDefaults', () => {
    it('should delegate to service', () => {
      const result = controller.getDefaults();
      expect(service.getDefaults).toHaveBeenCalled();
      expect(result).toEqual(mockDefaults);
    });
  });
});
