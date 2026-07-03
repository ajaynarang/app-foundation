import { RetryService } from '../retry.service';

describe('RetryService', () => {
  let service: RetryService;

  beforeEach(() => {
    service = new RetryService();
  });

  it('should succeed on first attempt', async () => {
    const operation = jest.fn().mockResolvedValue('success');

    const result = await service.withRetry(
      operation,
      {
        maxAttempts: 3,
        baseDelayMs: 100,
        maxDelayMs: 1000,
        exponentialBase: 2,
      },
      'test-operation',
    );

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should retry on network error', async () => {
    const operation = jest.fn().mockRejectedValueOnce(new Error('ECONNRESET')).mockResolvedValue('success');

    const result = await service.withRetry(
      operation,
      { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 100, exponentialBase: 2 },
      'test-operation',
    );

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('should not retry on 401 error', async () => {
    const error = { response: { status: 401 }, message: 'Unauthorized' };
    const operation = jest.fn().mockRejectedValue(error);

    await expect(
      service.withRetry(
        operation,
        {
          maxAttempts: 3,
          baseDelayMs: 10,
          maxDelayMs: 100,
          exponentialBase: 2,
        },
        'test-operation',
      ),
    ).rejects.toEqual(error);

    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should give up after max attempts', async () => {
    const operation = jest.fn().mockRejectedValue(new Error('ETIMEDOUT'));

    await expect(
      service.withRetry(
        operation,
        {
          maxAttempts: 3,
          baseDelayMs: 10,
          maxDelayMs: 100,
          exponentialBase: 2,
        },
        'test-operation',
      ),
    ).rejects.toThrow('ETIMEDOUT');

    expect(operation).toHaveBeenCalledTimes(3);
  });
});
