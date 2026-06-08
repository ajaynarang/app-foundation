import { CommsDriverTool } from '../comms-driver.tool';

describe('CommsDriverTool', () => {
  let tool: CommsDriverTool;
  let mockPrisma: { driver: { findMany: jest.Mock } };
  let mockSmsService: { sendSms: jest.Mock };

  beforeEach(() => {
    mockPrisma = {
      driver: {
        findMany: jest.fn().mockResolvedValue([{ driverId: 'DRV-x', name: 'John Smith', phone: '5551234567' }]),
      },
    };
    mockSmsService = {
      sendSms: jest.fn().mockResolvedValue(true),
    };
    tool = new CommsDriverTool(mockPrisma as any, mockSmsService as any);
  });

  it('returns error when tenant context missing', async () => {
    const result = await tool.sendDriverMessage({
      driverName: 'John Smith',
      message: 'Call the shipper.',
      _tenantId: undefined,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBeDefined();
    expect(mockSmsService.sendSms).not.toHaveBeenCalled();
  });

  it('driver not found — SmsService not called', async () => {
    mockPrisma.driver.findMany.mockResolvedValueOnce([]);
    const result = await tool.sendDriverMessage({
      driverName: 'Ghost Driver',
      message: 'Hello.',
      _tenantId: 1,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toMatch(/Ghost Driver/);
    expect(mockSmsService.sendSms).not.toHaveBeenCalled();
  });

  it('driver has no phone — SmsService not called', async () => {
    mockPrisma.driver.findMany.mockResolvedValueOnce([{ driverId: 'DRV-x', name: 'John Smith', phone: null }]);
    const result = await tool.sendDriverMessage({
      driverName: 'John Smith',
      message: 'Hello.',
      _tenantId: 1,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toMatch(/no phone/);
    expect(mockSmsService.sendSms).not.toHaveBeenCalled();
  });

  it('happy path — normalizes 10-digit to E.164 and sends SMS', async () => {
    const result = await tool.sendDriverMessage({
      driverName: 'John Smith',
      message: 'Pickup moved to 2pm.',
      _tenantId: 1,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.phone).toBe('+15551234567');
    expect(mockSmsService.sendSms).toHaveBeenCalledWith('+15551234567', 'Pickup moved to 2pm.');
  });

  it('SmsService returns false — user-friendly error', async () => {
    mockSmsService.sendSms.mockResolvedValueOnce(false);
    const result = await tool.sendDriverMessage({
      driverName: 'John Smith',
      message: 'Pickup moved to 2pm.',
      _tenantId: 1,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toMatch(/SMS not delivered/);
  });
});
