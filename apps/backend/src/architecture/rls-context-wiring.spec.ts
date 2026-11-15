import * as fs from 'fs';
import * as path from 'path';

/**
 * Tenant context is set where design item 19 says it is (rls-context.ts in @appshore/kernel). Each case fails when
 * one of the places that declares the context is reverted, so a request, job or tool call cannot silently run with
 * none. The behaviour itself is held by the unit specs beside each file and by bootstrap/__tests__/rls-context.http.
 */

const SRC = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(SRC, '..', '..', '..');
const PLATFORM = path.join(REPO_ROOT, 'packages', 'appshore', 'platform', 'src');
const KERNEL = path.join(REPO_ROOT, 'packages', 'appshore', 'kernel', 'src');

const read = (file: string) => fs.readFileSync(file, 'utf8');

describe('tenant context wiring', () => {
  const appModule = read(path.join(SRC, 'app.module.ts'));

  it('opens the holder in middleware on every route, after the request context', () => {
    expect(appModule).toMatch(
      /consumer\.apply\(\s*RequestContextMiddleware,\s*RlsContextMiddleware\s*\)\.forRoutes\('\*'\)/,
    );
  });

  it('registers RlsScopeInterceptor globally, before (outside) the idempotency interceptor', () => {
    const rls = appModule.indexOf('useClass: RlsScopeInterceptor');
    const idempotency = appModule.indexOf('useClass: IdempotencyInterceptor');
    expect(rls).toBeGreaterThan(-1);
    expect(idempotency).toBeGreaterThan(-1);
    expect(rls).toBeLessThan(idempotency);
  });

  it('merges the rls.* fields into the pino mixin', () => {
    expect(appModule).toMatch(/mixin: logContextMixin/);
    expect(read(path.join(KERNEL, 'infrastructure/logging/log-context-mixin.ts'))).toMatch(/rlsLogFields\(\)/);
  });

  it('runs every job in its own scope through withJobContext', () => {
    expect(read(path.join(KERNEL, 'infrastructure/logging/job-log-context.ts'))).toMatch(/runInJobScope\(/);
  });

  it.each([
    ['auth/guards/jwt-auth.guard.ts', 'RLS_SOURCE.JWT'],
    ['auth/guards/refresh-jwt-auth.guard.ts', 'RLS_SOURCE.REFRESH'],
    ['domains/api-keys/guards/api-key-auth.guard.ts', 'RLS_SOURCE.API_KEY'],
    ['domains/oauth-provider/oauth-token.guard.ts', 'RLS_SOURCE.OAUTH'],
  ])('%s pins the request tenant (%s)', (file, source) => {
    const text = read(path.join(PLATFORM, file));
    expect(text).toContain(`setRlsTenant(`);
    expect(text).toContain(source);
  });

  it.each([
    ['infrastructure/events/outbox-relay.service.ts', "systemScope('outbox-relay'"],
    ['infrastructure/deadlines/deadline.sweeper.ts', "systemScope('deadline-sweep'"],
  ])('%s declares its cross-tenant claim as system work and runs each row as its tenant', (file, scope) => {
    const text = read(path.join(PLATFORM, file));
    expect(text).toContain(scope);
    expect(text).toContain('runAsTenant(');
  });

  it('runs the AI tool call as the principal tenant', () => {
    const text = read(path.join(SRC, 'domains/ai/agent-contract/tool-executor.service.ts'));
    expect(text).toMatch(/runAsTenant\(principal\.tenantId, source/);
  });
});
