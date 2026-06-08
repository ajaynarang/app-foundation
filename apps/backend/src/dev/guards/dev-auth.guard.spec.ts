import { ExecutionContext } from '@nestjs/common';
import { DEV_AUTH_HEADER, DEV_AUTH_SECRET_ENV } from '../dev-auth.constants';

function mockCtx(headers: Record<string, string>): ExecutionContext {
  const req = {
    headers,
    ip: '127.0.0.1',
    get: (h: string) => headers[h.toLowerCase()],
  };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

/**
 * The env-type module caches `ENV_TYPE` on first read, so each test needs
 * a fresh module instance to reflect the env var set in that test's scope.
 * `jest.isolateModules` gives each test its own module tree.
 */
function freshGuard(): {
  canActivate: (ctx: ExecutionContext) => boolean;
} {
  let GuardCtor: new () => {
    canActivate: (ctx: ExecutionContext) => boolean;
  };
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    GuardCtor = require('./dev-auth.guard').DevAuthGuard;
  });
  return new GuardCtor();
}

describe('DevAuthGuard', () => {
  const OLD_ENV = { ...process.env };
  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  it('throws NotFoundException when DEV_AUTH_SECRET is unset', () => {
    delete process.env[DEV_AUTH_SECRET_ENV];
    process.env.ENV_TYPE = 'sandbox';
    expect(() => freshGuard().canActivate(mockCtx({}))).toThrow(expect.objectContaining({ name: 'NotFoundException' }));
  });

  it('throws NotFoundException when ENV_TYPE is production (even with secret + correct header)', () => {
    process.env.ENV_TYPE = 'production';
    process.env[DEV_AUTH_SECRET_ENV] = 'right';
    expect(() => freshGuard().canActivate(mockCtx({ [DEV_AUTH_HEADER]: 'right' }))).toThrow(
      expect.objectContaining({ name: 'NotFoundException' }),
    );
  });

  it('allows requests in sandbox env when secret matches (staging/preprod)', () => {
    process.env.ENV_TYPE = 'sandbox';
    process.env[DEV_AUTH_SECRET_ENV] = 'right';
    expect(freshGuard().canActivate(mockCtx({ [DEV_AUTH_HEADER]: 'right' }))).toBe(true);
  });

  it('throws UnauthorizedException when header is missing', () => {
    process.env.ENV_TYPE = 'development';
    process.env[DEV_AUTH_SECRET_ENV] = 'right';
    expect(() => freshGuard().canActivate(mockCtx({}))).toThrow(
      expect.objectContaining({ name: 'UnauthorizedException' }),
    );
  });

  it('throws UnauthorizedException when header is wrong', () => {
    process.env.ENV_TYPE = 'development';
    process.env[DEV_AUTH_SECRET_ENV] = 'right';
    expect(() => freshGuard().canActivate(mockCtx({ [DEV_AUTH_HEADER]: 'wrong' }))).toThrow(
      expect.objectContaining({ name: 'UnauthorizedException' }),
    );
  });

  it('returns true when header matches exactly', () => {
    process.env.ENV_TYPE = 'development';
    process.env[DEV_AUTH_SECRET_ENV] = 'right';
    expect(freshGuard().canActivate(mockCtx({ [DEV_AUTH_HEADER]: 'right' }))).toBe(true);
  });

  it('throws UnauthorizedException for a shorter header (length mismatch)', () => {
    process.env.ENV_TYPE = 'development';
    process.env[DEV_AUTH_SECRET_ENV] = 'right';
    expect(() => freshGuard().canActivate(mockCtx({ [DEV_AUTH_HEADER]: 'r' }))).toThrow(
      expect.objectContaining({ name: 'UnauthorizedException' }),
    );
  });
});
