import { FeatureFlagsController } from '../feature-flags.controller';

describe('FeatureFlagsController', () => {
  let controller: FeatureFlagsController;
  let service: any;

  beforeEach(() => {
    service = {
      getAllFlags: jest.fn().mockResolvedValue([{ key: 'shield', enabled: true }]),
      getFlagByKey: jest.fn().mockResolvedValue({ key: 'shield', enabled: true }),
      isEnabled: jest.fn().mockResolvedValue(true),
      toggleFlag: jest.fn().mockResolvedValue({ key: 'shield', enabled: false }),
    };
    controller = new FeatureFlagsController(service);
  });

  it('getAllFlags wraps in FeatureFlagsResponse', async () => {
    const result = await controller.getAllFlags();
    expect(result.flags).toHaveLength(1);
  });

  it('getFlagByKey returns flag', async () => {
    const result = await controller.getFlagByKey('shield');
    expect(result.key).toBe('shield');
  });

  it('getFlagByKey throws when not found', async () => {
    service.getFlagByKey.mockResolvedValue(null);
    await expect(controller.getFlagByKey('bad')).rejects.toThrow();
  });

  it('isEnabled returns key and enabled status', async () => {
    const result = await controller.isEnabled('shield');
    expect(result).toEqual({ key: 'shield', enabled: true });
  });

  it('updateFlag delegates to service', async () => {
    const result = await controller.updateFlag('shield', {
      enabled: false,
    });
    expect(service.toggleFlag).toHaveBeenCalledWith('shield', false);
    expect(result.enabled).toBe(false);
  });
});
