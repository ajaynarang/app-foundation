import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from '../health.controller';
import { HealthCheckService, HealthCheckResult, PrismaHealthIndicator } from '@nestjs/terminus';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { RedisHealthIndicator } from '../indicators/redis.health-indicator';

const okResult: HealthCheckResult = {
  status: 'ok',
  info: { liveness: { status: 'up' } },
  error: {},
  details: { liveness: { status: 'up' } },
};

describe('HealthController', () => {
  let controller: HealthController;
  let healthCheckService: jest.Mocked<HealthCheckService>;

  beforeEach(async () => {
    const mockHealthCheckService = {
      check: jest.fn().mockResolvedValue(okResult),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: mockHealthCheckService },
        { provide: PrismaHealthIndicator, useValue: {} },
        { provide: PrismaService, useValue: {} },
        { provide: RedisHealthIndicator, useValue: {} },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    healthCheckService = module.get(HealthCheckService);
  });

  describe('GET /health/live', () => {
    it('returns ok result from health check service', async () => {
      const result = await controller.liveness();
      expect(result).toEqual(okResult);
      expect(healthCheckService.check).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /health/ready', () => {
    it('returns ok result when all dependencies are up', async () => {
      const result = await controller.readiness();
      expect(result).toEqual(okResult);
      expect(healthCheckService.check).toHaveBeenCalledTimes(1);
    });
  });
});
