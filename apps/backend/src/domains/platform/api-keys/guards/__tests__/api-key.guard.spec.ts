import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ApiKeyGuard } from '../api-key.guard';
import { ApiKeysService } from '../../api-keys.service';

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;
  let apiKeysService: Record<string, jest.Mock>;

  const createMockContext = (headers: Record<string, string> = {}) => {
    const request: Record<string, any> = { headers };
    return {
      ctx: {
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext,
      request,
    };
  };

  beforeEach(async () => {
    apiKeysService = {
      validateKey: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [ApiKeyGuard, { provide: ApiKeysService, useValue: apiKeysService }],
    }).compile();

    guard = module.get(ApiKeyGuard);
  });

  it('should throw UnauthorizedException when no Authorization header', async () => {
    const { ctx } = createMockContext({});

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    await expect(guard.canActivate(ctx)).rejects.toThrow('API key required');
  });

  it('should throw UnauthorizedException when not Bearer scheme', async () => {
    const { ctx } = createMockContext({ authorization: 'Basic abc123' });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    await expect(guard.canActivate(ctx)).rejects.toThrow('API key required');
  });

  it('should throw UnauthorizedException when API key validation fails', async () => {
    apiKeysService.validateKey.mockResolvedValue(null);
    const { ctx } = createMockContext({
      authorization: 'Bearer sk_test_invalid',
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    await expect(guard.canActivate(ctx)).rejects.toThrow('Invalid or expired API key');
  });

  it('should attach apiKey and user to request on success', async () => {
    const mockApiKey = {
      id: 'key-1',
      user: { userId: 'usr-1', role: 'DISPATCHER' },
    };
    apiKeysService.validateKey.mockResolvedValue(mockApiKey);
    const { ctx, request } = createMockContext({
      authorization: 'Bearer sk_test_valid',
    });

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(request.apiKey).toBe(mockApiKey);
    expect(request.user).toBe(mockApiKey.user);
    expect(apiKeysService.validateKey).toHaveBeenCalledWith('sk_test_valid');
  });

  it('should handle expired API key (validateKey returns null)', async () => {
    apiKeysService.validateKey.mockResolvedValue(null);
    const { ctx } = createMockContext({
      authorization: 'Bearer sk_test_expired',
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow('Invalid or expired API key');
  });
});
