import { Test, TestingModule } from '@nestjs/testing';
import { VendorCircuitBreakerService } from '../vendor-circuit-breaker.service';
import { REDIS_CLIENT } from '../../cache/redis-client.provider';

const mockRedis = {
  incr: jest.fn(),
  expire: jest.fn(),
  set: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
};

describe('VendorCircuitBreakerService', () => {
  let service: VendorCircuitBreakerService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRedis.incr.mockResolvedValue(1);
    mockRedis.expire.mockResolvedValue(1);
    mockRedis.set.mockResolvedValue('OK');
    mockRedis.get.mockResolvedValue(null);
    mockRedis.del.mockResolvedValue(1);

    const module: TestingModule = await Test.createTestingModule({
      providers: [VendorCircuitBreakerService, { provide: REDIS_CLIENT, useValue: mockRedis }],
    }).compile();
    service = module.get<VendorCircuitBreakerService>(VendorCircuitBreakerService);
  });

  describe('recordFailure', () => {
    it('opens after 5 failures within window', async () => {
      mockRedis.incr.mockResolvedValue(5);

      await service.recordFailure('acme-vendor');

      expect(mockRedis.set).toHaveBeenCalledWith('circuit:acme-vendor:open', '1', 'EX', 300, 'NX');
    });

    it('sets expiry only on first failure', async () => {
      mockRedis.incr.mockResolvedValueOnce(1);
      await service.recordFailure('acme-vendor');
      expect(mockRedis.expire).toHaveBeenCalledWith('circuit:acme-vendor:failures', 60);

      mockRedis.expire.mockClear();

      mockRedis.incr.mockResolvedValueOnce(2);
      await service.recordFailure('acme-vendor');
      expect(mockRedis.expire).not.toHaveBeenCalled();
    });
  });

  describe('isOpen', () => {
    it('reports open when circuit is set', async () => {
      mockRedis.get.mockResolvedValue('1');
      await expect(service.isOpen('acme-vendor')).resolves.toBe(true);
    });

    it('reports closed when circuit is not set', async () => {
      mockRedis.get.mockResolvedValue(null);
      await expect(service.isOpen('acme-vendor')).resolves.toBe(false);
    });
  });

  describe('recordSuccess', () => {
    it('resets failure counter on success', async () => {
      await service.recordSuccess('acme-vendor');
      expect(mockRedis.del).toHaveBeenCalledWith('circuit:acme-vendor:failures');
    });
  });
});
