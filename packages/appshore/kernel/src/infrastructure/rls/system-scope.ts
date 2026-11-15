import { Logger } from '@nestjs/common';
import {
  RLS_SOURCE,
  RlsContextError,
  currentRls,
  describeCtx,
  isRlsStrict,
  isRlsTenantId,
  runAsTenant,
  runInRlsHolder,
} from './rls-context';
import { SYSTEM_REASONS_ALLOWED_IN_TENANT_SCOPE, type SystemReason, isSystemReason } from './system-reasons';

const logger = new Logger('RlsSystemScope');

/**
 * An unlisted reason throws in strict mode (tests, CI). In a deployed task it is logged and the work still runs: while
 * nothing enforces row-level security, a typo in a reason must never stop a sweep.
 */
function checkSystemReason(reason: string): void {
  if (isSystemReason(reason)) return;
  const message = `"${reason}" is not a listed system reason (see system-reasons.ts)`;
  if (isRlsStrict()) throw new RlsContextError(message);
  logger.error(`${message}; running it anyway while row-level security is not enforced`);
}

/**
 * Run `fn` as declared cross-tenant work. Today this records `{ kind: 'system', reason }`, so log lines name a reason
 * instead of "no context"; queries still use the one connection pool. When enforcement arrives this moves onto a
 * system pool, and call sites keep this signature.
 *
 * Entering a system scope from inside a tenant or public scope is a privilege escalation: strict mode throws,
 * otherwise it is logged and allowed. `SYSTEM_REASONS_ALLOWED_IN_TENANT_SCOPE` holds the reviewed exceptions.
 */
export async function systemScope<T>(reason: SystemReason, fn: () => Promise<T> | T): Promise<T> {
  checkSystemReason(reason);
  const existing = currentRls();
  if (existing && existing.kind !== 'system' && !SYSTEM_REASONS_ALLOWED_IN_TENANT_SCOPE.includes(reason)) {
    const message = `Cannot enter system scope (${reason}) inside ${describeCtx(existing)}`;
    if (isRlsStrict()) throw new RlsContextError(message);
    logger.error(`${message}; running it anyway while row-level security is not enforced`);
  }
  return runInRlsHolder({ ctx: { kind: 'system', reason } }, fn);
}

/**
 * Visit tenants one at a time: list them inside `systemScope(reason)`, then run `fn` for each row inside
 * `runAsTenant(tenant, 'cron:<reason>')`.
 *
 * - Sequential by design.
 * - No error handling of its own: a throw from `fn` ends the loop and propagates, as a bare `for` loop would. A loop
 *   that isolates tenants keeps its own `try/catch` inside `fn`.
 * - A row whose tenant id is not a positive integer throws in strict mode; otherwise it is logged and skipped.
 * - `rows` is a lister (run in the system scope) or rows the caller already listed.
 * - Rows are tenants (`{ id }`) by default; pass `tenantOf` for rows that belong to a tenant.
 *
 * Returns the rows it visited.
 */
export function forEachTenant<T extends { id: number }>(
  reason: SystemReason,
  rows: readonly T[] | (() => Promise<readonly T[]>),
  fn: (row: T) => Promise<unknown>,
): Promise<readonly T[]>;
export function forEachTenant<T>(
  reason: SystemReason,
  rows: readonly T[] | (() => Promise<readonly T[]>),
  fn: (row: T) => Promise<unknown>,
  tenantOf: (row: T) => number,
): Promise<readonly T[]>;
export async function forEachTenant<T>(
  reason: SystemReason,
  rows: readonly T[] | (() => Promise<readonly T[]>),
  fn: (row: T) => Promise<unknown>,
  tenantOf: (row: T) => number = (row) => (row as { id: number }).id,
): Promise<readonly T[]> {
  const source = `${RLS_SOURCE.CRON}:${reason}`;
  return systemScope(reason, async () => {
    const list = typeof rows === 'function' ? await rows() : rows;
    for (const row of list) {
      const tenantId = tenantOf(row);
      if (!isRlsTenantId(tenantId)) {
        const message = `${reason}: row has no valid tenant id (got ${String(tenantId)})`;
        if (isRlsStrict()) throw new RlsContextError(message);
        logger.error(`${message}; skipping the row`);
        continue;
      }
      await runAsTenant(tenantId, source, () => fn(row));
    }
    return list;
  });
}
