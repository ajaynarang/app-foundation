import {
  type CallHandler,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  type NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { HTTP_CODE_METADATA, RESPONSE_PASSTHROUGH_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import type { Request, Response } from 'express';
import { from, type Observable, of, throwError } from 'rxjs';
import { catchError, mergeMap, switchMap } from 'rxjs/operators';
import {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENT_REPLAYED_HEADER,
  type IdempotencyClaim,
  IdempotencyStore,
  requestFingerprint,
} from './idempotency.store';

const SKIP_IDEMPOTENCY = 'appshore:skipIdempotency';

/**
 * Opt a create out of `Idempotency-Key`. A route whose body shows a secret once (an API key, a client or signing
 * secret, an invite link) must never be stored for replay: `swagger-completeness.spec.ts` fails on one that is not
 * marked.
 */
export const SkipIdempotency = () => SetMetadata(SKIP_IDEMPOTENCY, true);

/** A claim that does not answer within this long is skipped: a Redis outage must not stall creates. */
const CLAIM_TIMEOUT_MS = 2000;

/**
 * `Idempotency-Key` on every create (ADR "API contract", section 5; held by `idempotency.spec.ts`): an authenticated
 * POST whose status is 201 (a new record) or 202 (queued work). Global, so a new create route is covered without a
 * decorator; the OpenAPI builder documents the header on exactly these operations. A request without the header or
 * without a tenant (sign-up, public webhooks, a super admin), a multipart upload, a `@SkipIdempotency()` route or one
 * that writes its own response (`@Res`) passes straight through. The key is scoped to the tenant AND the user: a
 * replay never hands one person another's answer.
 *
 * Fail-open: if Redis cannot claim or remember, the request runs (and answers) as it would without a key.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(private readonly store: IdempotencyStore) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<Request & { user?: { tenantId?: string; userId?: string } }>();
    const key = req.header(IDEMPOTENCY_KEY_HEADER);
    const { tenantId, userId } = req.user ?? {};
    const status = idempotentCreateStatus(req.method, context.getClass(), context.getHandler());
    if (key === undefined || !tenantId || status === null || req.is('multipart/form-data')) return next.handle();

    const res = context.switchToHttp().getResponse<Response>();
    const fingerprint = requestFingerprint(`${req.method} ${req.path}`, { body: req.body ?? null, query: req.query });

    return from(this.claim(`t:${tenantId}:u:${userId ?? '-'}`, key, fingerprint)).pipe(
      switchMap((claim) => {
        if (!claim) return next.handle();
        if (claim.kind === 'replay') {
          res.setHeader(IDEMPOTENT_REPLAYED_HEADER, 'true');
          res.status(claim.result.status);
          return of(claim.result.body);
        }
        return next.handle().pipe(
          mergeMap((body) => from(this.remember(claim, { status, body }).then(() => body))),
          catchError((error) =>
            from(claim.release().catch(() => undefined)).pipe(mergeMap(() => throwError(() => error))),
          ),
        );
      }),
    );
  }

  /** The claim, or null (run without a key) when the store is unreachable; a 4xx from the store (409, 400) stands. */
  private async claim(scope: string, key: string, fingerprint: ReturnType<typeof requestFingerprint>) {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), CLAIM_TIMEOUT_MS)));
    try {
      const claim = await Promise.race([this.store.claim(scope, key, fingerprint), timeout]);
      if (!claim) this.logger.warn('Idempotency store did not answer in time: running without the key');
      return claim;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.warn(`Idempotency store unavailable, running without the key: ${(error as Error).message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /** The create already happened: failing to remember it must never turn it into an error (or a duplicate). */
  private async remember(claim: Extract<IdempotencyClaim, { kind: 'run' }>, result: { status: number; body: unknown }) {
    try {
      await claim.complete(result);
    } catch (error) {
      this.logger.warn(`Idempotency: could not remember a response: ${(error as Error).message}`);
    }
  }
}

/**
 * The status a POST answers when it is a create (201) or a queued create (202), which is what `Idempotency-Key`
 * covers, or null for any other route. Nest's default for a POST without `@HttpCode` is 201.
 */
export function idempotentCreateStatus(method: string, controller: object, handler: object): number | null {
  if (method.toUpperCase() !== 'POST') return null;
  if (Reflect.getMetadata(SKIP_IDEMPOTENCY, handler)) return null;
  if (writesOwnResponse(controller, handler)) return null;
  const status: number = Reflect.getMetadata(HTTP_CODE_METADATA, handler) ?? HttpStatus.CREATED;
  return status === HttpStatus.CREATED || status === HttpStatus.ACCEPTED ? status : null;
}

/** A handler with `@Res()` (not `passthrough`) writes the response itself: there is no body to remember. */
function writesOwnResponse(controller: object, handler: object): boolean {
  const name = (handler as { name?: string }).name;
  if (!name) return false;
  if (Reflect.getMetadata(RESPONSE_PASSTHROUGH_METADATA, controller, name)) return false;
  const args: Record<string, unknown> = Reflect.getMetadata(ROUTE_ARGS_METADATA, controller, name) ?? {};
  return Object.keys(args).some((key) => key.split(':')[0] === String(RouteParamtypes.RESPONSE));
}
