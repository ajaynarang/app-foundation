import { HealthCheckError } from '@nestjs/terminus';
import Redis from 'ioredis';
import { RedisHealthIndicator } from '../redis.health-indicator';

describe('RedisHealthIndicator', () => {
  let indicator: RedisHealthIndicator;
  let pingMock: jest.Mock;

  beforeEach(() => {
    pingMock = jest.fn();
    const fakeRedis = { ping: pingMock } as unknown as Redis;
    indicator = new RedisHealthIndicator(fakeRedis);
  });

  it('returns up status when redis ping succeeds', async () => {
    pingMock.mockResolvedValue('PONG');
    const result = await indicator.pingCheck('redis');
    expect(result).toEqual({ redis: { status: 'up' } });
  });

  it('throws HealthCheckError when redis ping rejects', async () => {
    pingMock.mockRejectedValue(new Error('Connection refused'));
    await expect(indicator.pingCheck('redis')).rejects.toThrow(HealthCheckError);
  });

  it('throws HealthCheckError when ping returns non-PONG', async () => {
    pingMock.mockResolvedValue('WRONG');
    await expect(indicator.pingCheck('redis')).rejects.toThrow(HealthCheckError);
  });
});
