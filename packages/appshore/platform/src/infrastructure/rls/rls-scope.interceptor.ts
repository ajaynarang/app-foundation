import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { RLS_SOURCE, runAsTenant, toRlsTenantId } from '@appshore/kernel/infrastructure/rls/rls-context';
import { systemScope } from '@appshore/kernel/infrastructure/rls/system-scope';
import {
  SYSTEM_SCOPE_METADATA,
  TARGET_TENANT_METADATA,
  type TargetTenantOptions,
} from '@appshore/kernel/infrastructure/rls/system-scope.decorator';
import type { SystemReason } from '@appshore/kernel/infrastructure/rls/system-reasons';
import { PrismaService } from '../database/prisma.service';

interface ScopedRequest {
  method?: string;
  originalUrl?: string;
  url?: string;
  params?: Record<string, string | undefined>;
  user?: { userId?: unknown; dbId?: unknown; id?: unknown };
}

/**
 * Applies `@SystemScope` and `@TargetTenant`. Registered globally, outside the idempotency interceptor, so a replayed
 * response runs in the same context; a no-op for every route that carries neither. Interceptors run after the guards,
 * so `RolesGuard` has already refused anyone who is not SUPER_ADMIN.
 *
 * - `@TargetTenant` (method or class): resolve the tenant named in the URL and run the handler as that tenant, with
 *   an audit line. An unknown or malformed tenant runs the handler with no context; it answers 400 or 404 itself.
 * - `@SystemScope(reason)` (method or class): run the handler in a `system` scope with that reason, logging the
 *   reason and the super-admin.
 *
 * Handlers keep using `PrismaService`: there is one connection pool until row-level security is enforced.
 */
@Injectable()
export class RlsScopeInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RlsScopeInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const targets = [context.getHandler(), context.getClass()];
    const target = this.reflector.getAllAndOverride<TargetTenantOptions | undefined>(TARGET_TENANT_METADATA, targets);
    const reason = this.reflector.getAllAndOverride<SystemReason | undefined>(SYSTEM_SCOPE_METADATA, targets);
    const req = context.switchToHttp().getRequest<ScopedRequest>();
    if (target) return runObservableIn(next, (run) => this.runAsTarget(req, target, run));
    if (reason) return runObservableIn(next, (run) => this.runAsSystem(req, reason, run));
    return next.handle();
  }

  private runAsSystem<T>(req: ScopedRequest, reason: SystemReason, run: () => Promise<T>): Promise<T> {
    this.logger.log(`system scope reason=${reason} ${describeActor(req)} ${describeRoute(req)}`);
    return systemScope(reason, run);
  }

  private async runAsTarget<T>(req: ScopedRequest, target: TargetTenantOptions, run: () => Promise<T>): Promise<T> {
    const raw = req.params?.[target.param];
    const tenantId = target.by === 'id' ? toRlsTenantId(raw) : await this.resolveSlug(raw);
    if (tenantId === undefined) {
      this.logger.warn(`target tenant ${target.param} not resolved; ${describeRoute(req)} runs with no tenant context`);
      return run();
    }
    this.logger.log(`super-admin acting as tenant ${tenantId} ${describeActor(req)} ${describeRoute(req)}`);
    return runAsTenant(tenantId, RLS_SOURCE.SUPER_ADMIN, run);
  }

  /** Public id → DB id. `tenants` is not tenant-scoped, so this reads it with no context. */
  private async resolveSlug(slug: string | undefined): Promise<number | undefined> {
    if (!slug) return undefined;
    const row = await this.prisma.tenant.findUnique({ where: { tenantId: slug }, select: { id: true } });
    return row?.id;
  }
}

/**
 * Subscribe to the handler inside `scope`, so the handler body and every async continuation it starts inherit the
 * AsyncLocalStorage context. The scope's promise settles when the handler's observable does.
 */
function runObservableIn(next: CallHandler, scope: (run: () => Promise<void>) => Promise<void>): Observable<unknown> {
  return new Observable<unknown>((subscriber) => {
    let inner: { unsubscribe(): void } | undefined;
    scope(
      () =>
        new Promise<void>((resolve) => {
          inner = next.handle().subscribe({
            next: (value) => subscriber.next(value),
            error: (err: unknown) => {
              subscriber.error(err);
              resolve();
            },
            complete: () => {
              subscriber.complete();
              resolve();
            },
          });
        }),
    ).catch((err: unknown) => subscriber.error(err));
    return () => inner?.unsubscribe();
  });
}

function describeActor(req: ScopedRequest): string {
  const user = req.user;
  const id = user?.userId ?? user?.dbId ?? user?.id;
  return `user=${typeof id === 'string' || typeof id === 'number' ? id : 'unknown'}`;
}

/** Method and path only: the query string never reaches a log line. */
function describeRoute(req: ScopedRequest): string {
  const url = req.originalUrl ?? req.url ?? '?';
  return `${req.method ?? '?'} ${url.split('?')[0]}`;
}
