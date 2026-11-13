import { rlsStorage } from './rls-context';

export const RLS_LOG_FIELDS = {
  KIND: 'rls.kind',
  TENANT: 'rls.tenant',
  SOURCE: 'rls.source',
  REASON: 'rls.reason',
} as const;

export const RLS_KIND_NONE = 'none';

/**
 * Log fields describing the current tenant context, merged into every line by the pino mixin, so a log query shows
 * which tenant each request and job ran as. Outside any scope (boot, timers) it adds nothing; inside a scope with no
 * tenant it reports `rls.kind=none`; declared system work reports `rls.kind=system` with its `rls.reason`.
 */
export function rlsLogFields(): Record<string, string> {
  const holder = rlsStorage.getStore();
  if (!holder) return {};

  const ctx = holder.ctx;
  if (!ctx) return { [RLS_LOG_FIELDS.KIND]: RLS_KIND_NONE };
  if (ctx.kind === 'system') {
    return { [RLS_LOG_FIELDS.KIND]: ctx.kind, [RLS_LOG_FIELDS.REASON]: ctx.reason };
  }
  if (ctx.kind === 'public') {
    return { [RLS_LOG_FIELDS.KIND]: ctx.kind, [RLS_LOG_FIELDS.SOURCE]: ctx.source };
  }
  return {
    [RLS_LOG_FIELDS.KIND]: ctx.kind,
    [RLS_LOG_FIELDS.TENANT]: String(ctx.tenantId),
    [RLS_LOG_FIELDS.SOURCE]: ctx.source,
  };
}
