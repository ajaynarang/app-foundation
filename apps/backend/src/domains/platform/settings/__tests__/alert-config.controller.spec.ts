import { AlertConfigController } from '../alert-config.controller';

describe('AlertConfigController', () => {
  let controller: AlertConfigController;
  let service: any;

  const mockUser = { tenantDbId: 42 };
  const mockConfig = { alertTypes: { hosViolation: true } };

  beforeEach(() => {
    service = {
      getConfig: jest.fn().mockResolvedValue(mockConfig),
      updateConfig: jest.fn().mockResolvedValue({ ...mockConfig, updated: true }),
    };
    controller = new AlertConfigController(service);
  });

  describe('getConfig', () => {
    it('should delegate to service with tenantDbId', async () => {
      const result = await controller.getConfig(mockUser);
      expect(service.getConfig).toHaveBeenCalledWith(42);
      expect(result).toEqual(mockConfig);
    });
  });

  describe('updateConfig', () => {
    it('should delegate to service with tenantDbId and dto', async () => {
      const dto = { alertTypes: { hosViolation: false } };
      const result = await controller.updateConfig(mockUser, dto as any);
      expect(service.updateConfig).toHaveBeenCalledWith(42, dto);
      expect(result).toEqual({ ...mockConfig, updated: true });
    });
  });
});
