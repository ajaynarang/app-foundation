import { AsyncLocalStorage } from 'node:async_hooks';
import { inspect } from 'node:util';
import { Logger } from '@nestjs/common';

const logger = new Logger('RlsContext');

/**
 * Strict mode (`RLS_STRICT_CONTEXT=throw`): a context conflict throws instead of being logged. On in unit tests (each
 * package's Jest setup) and so in every CI run of them; off in deployed tasks while nothing enforces row-level
 * security, so a conflict can never fail a live request. Read per call so a test can toggle it.
 */
export const RLS_STRICT_CONTEXT_ENV = 'RLS_STRICT_CONTEXT';
export const RLS_STRICT_THROW = 'throw';

export function isRlsStrict(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[RLS_STRICT_CONTEXT_ENV] === RLS_STRICT_THROW;
}

/**
 * The tenant a unit of work runs as: the context Postgres row-level security will read once it is enforced. Nothing
 * enforces it yet; today it is declared, carried and logged (`rls.*` fields on every log line). Kept in its own
 * AsyncLocalStorage, apart from the log store (`requestContextStorage`): the log store carries a public id or
 * 'system', and logging plumbing must never be able to grant database access.
 *
 * - `tenant`: every tenant-scoped query runs as this numeric tenant id.
 * - `public`: anonymous traffic that resolved no tenant.
 * - `system`: declared cross-tenant work (`systemScope`, `forEachTenant`, `@SystemScope`), carrying a reason from
 *   `system-reasons.ts`.
 * - no context: undeclared. Once row-level security is enforced, tenant tables fail closed for it.
 */
export type RlsCtx =
  | { kind: 'tenant'; tenantId: number; source: string }
  | { kind: 'public'; source: string }
  | { kind: 'system'; reason: string };

export interface RlsHolder {
  ctx?: RlsCtx;
  /** Set by the (later) per-transaction adapter; a fresh scope always clears it. */
  inTx?: true;
}

export const rlsStorage = new AsyncLocalStorage<RlsHolder>();

/** Where a context was set; reported as `rls.source` on log lines. A suffix (`tool:<name>`) is allowed. */
export const RLS_SOURCE = {
  JWT: 'jwt',
  API_KEY: 'api-key',
  OAUTH: 'oauth',
  REFRESH: 'refresh',
  JOB: 'job',
  /** A per-tenant pass of a cron loop (`forEachTenant`). */
  CRON: 'cron',
  /** A domain-event handler re-entering its tenant (`@OnTenantEvent`, the outbox relay). */
  EVENT: 'event',
  /** A deadline handler, run by the sweeper as the deadline's tenant. */
  DEADLINE: 'deadline',
  /** An AI tool call, run as the principal's tenant. */
  TOOL: 'tool',
  /** A Desk workflow step (`deskStep`). */
  DESK: 'desk',
  /** A public invitation route, once the token named its tenant. */
  INVITATION: 'invitation',
  /** A super-admin route acting on one tenant (`@TargetTenant`). */
  SUPER_ADMIN: 'super-admin',
} as const;

export class RlsContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RlsContextError';
  }
}

export function isRlsTenantId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

const NUMERIC_ID = /^[1-9]\d*$/;

/**
 * A tenant DB id from a positive integer or its canonical decimal string. Anything else (a public id, 'system',
 * '07', 0) is not a tenant DB id.
 */
export function toRlsTenantId(raw: unknown): number | undefined {
  if (isRlsTenantId(raw)) return raw;
  if (typeof raw === 'string' && NUMERIC_ID.test(raw)) {
    const id = Number(raw);
    return isRlsTenantId(id) ? id : undefined;
  }
  return undefined;
}

function assertTenantId(id: unknown): asserts id is number {
  if (!isRlsTenantId(id)) {
    throw new RlsContextError(`RLS tenant id must be a positive integer, got ${inspect(id)}`);
  }
}

export function describeCtx(ctx: RlsCtx): string {
  if (ctx.kind === 'tenant') return `tenant ${ctx.tenantId} (${ctx.source})`;
  if (ctx.kind === 'system') return `system (${ctx.reason})`;
  return `public (${ctx.source})`;
}

/**
 * Run `fn` with `holder` as the store, awaiting its result INSIDE the scope. Prisma queries are lazy: an un-awaited
 * query returned from the scope would run after it closed.
 */
export function runInRlsHolder<T>(holder: RlsHolder, fn: () => Promise<T> | T): Promise<T> {
  return rlsStorage.run(holder, async () => await fn());
}

export function currentRls(): RlsCtx | undefined {
  return rlsStorage.getStore()?.ctx;
}

/**
 * Pin the current scope (the holder `RlsContextMiddleware` opened) to a tenant. Set-once: setting the same tenant
 * again is a no-op. A different tenant keeps the first and logs an error, or throws in strict mode. Returns false
 * when nothing was written: no holder is open (a WebSocket, a unit test that never ran the middleware) or the set
 * conflicted.
 */
export function setRlsTenant(id: number, source: string): boolean {
  assertTenantId(id);
  const holder = rlsStorage.getStore();
  if (!holder) return false;

  const existing = holder.ctx;
  if (existing?.kind === 'tenant' && existing.tenantId === id) return true;
  if (existing) {
    const message = `Cannot set RLS tenant ${id} (${source}): scope already runs as ${describeCtx(existing)}`;
    if (isRlsStrict()) throw new RlsContextError(message);
    logger.error(`${message}; keeping the first context`);
    return false;
  }

  holder.ctx = { kind: 'tenant', tenantId: id, source };
  return true;
}

/**
 * Run `fn` as tenant `id` in a fresh scope (which also clears `inTx`). Throws inside a different tenant or a public
 * scope. Narrowing a `system` scope to one tenant is allowed: that is how `forEachTenant`, the outbox relay and the
 * deadline sweeper reach each tenant.
 */
export async function runAsTenant<T>(id: number, source: string, fn: () => Promise<T> | T): Promise<T> {
  assertTenantId(id);
  const existing = currentRls();
  if (existing && existing.kind !== 'system' && !(existing.kind === 'tenant' && existing.tenantId === id)) {
    throw new RlsContextError(`Cannot run as tenant ${id} (${source}) inside ${describeCtx(existing)}`);
  }
  return runInRlsHolder({ ctx: { kind: 'tenant', tenantId: id, source } }, fn);
}

/** Run `fn` in the `public` scope (no tenant). Throws inside a tenant scope. */
export async function runAsPublic<T>(source: string, fn: () => Promise<T> | T): Promise<T> {
  const existing = currentRls();
  if (existing?.kind === 'tenant') {
    throw new RlsContextError(`Cannot run as public (${source}) inside ${describeCtx(existing)}`);
  }
  return runInRlsHolder({ ctx: { kind: 'public', source } }, fn);
}

/**
 * A job is its own isolation boundary: whatever scope enqueued or invoked it, the job runs as the tenant its payload
 * names, or with no context when it names none. Only the job wrapper (`withJobContext`) calls this.
 */
export async function runInJobScope<T>(tenantId: number | undefined, source: string, fn: () => Promise<T>): Promise<T> {
  if (tenantId === undefined) return runInRlsHolder({}, fn);
  assertTenantId(tenantId);
  return runInRlsHolder({ ctx: { kind: 'tenant', tenantId, source } }, fn);
}

/**
 * A domain-event handler re-enters its tenant from the payload instead of trusting the scope the emitter ran in
 * (EventEmitter2 `{ async: true }` carries the emitter's context, `inTx` included). The fresh scope clears `inTx`.
 * An emitter running as a different tenant is a bug: logged, or thrown in strict mode. A payload with no tenant DB id
 * is reported the same way and runs with no context.
 */
export async function runInEventScope<T>(rawTenantId: unknown, source: string, fn: () => Promise<T>): Promise<T> {
  const tenantId = toRlsTenantId(rawTenantId);
  const emitter = currentRls();
  if (tenantId === undefined) {
    reportConflict(`Event ${source} carries no tenant id (got ${inspect(rawTenantId)})`);
    return runInRlsHolder({}, fn);
  }
  if (emitter?.kind === 'tenant' && emitter.tenantId !== tenantId) {
    reportConflict(`Event ${source} for tenant ${tenantId} was emitted inside ${describeCtx(emitter)}`);
  }
  return runInRlsHolder({ ctx: { kind: 'tenant', tenantId, source } }, fn);
}

function reportConflict(message: string): void {
  if (isRlsStrict()) throw new RlsContextError(message);
  logger.error(message);
}
