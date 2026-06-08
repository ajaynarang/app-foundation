import { PinService } from '../pin.service';

describe('PinService', () => {
  let service: PinService;

  beforeEach(() => {
    service = new PinService();
  });

  it('should hash a PIN and verify it correctly', async () => {
    const hash = await service.hashPin('1234');
    expect(hash).not.toBe('1234');
    const isValid = await service.verifyPin('1234', hash);
    expect(isValid).toBe(true);
  }, 15000);

  it('should reject wrong PIN', async () => {
    const hash = await service.hashPin('1234');
    const isValid = await service.verifyPin('9999', hash);
    expect(isValid).toBe(false);
  }, 15000);

  it('should validate PIN is exactly 4 digits', () => {
    expect(service.isValidPin('1234')).toBe(true);
    expect(service.isValidPin('123')).toBe(false);
    expect(service.isValidPin('12345')).toBe(false);
    expect(service.isValidPin('abcd')).toBe(false);
  });
});
