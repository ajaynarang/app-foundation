/**
 * Tenant Reset — Core execution.
 *
 * Public API:
 *   - `runReset(prisma, options)` — programmatic entry (used by CLI + demo shim)
 *   - `soft(prisma, tenantSlug, opts)` — shorthand for soft mode
 *   - `hard(prisma, tenantSlug, opts)` — shorthand for hard mode
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { entriesForMode, REGISTRY, type RegistryEntry, type ResetMode } from './registry';
import { assertSafeToProceed, type SafetyOptions } from './safety';

export interface ResetOptions {
  readonly tenantSlug: string;
  readonly mode: ResetMode;
  readonly yes: boolean;
  readonly hardConfirm: boolean;
  readonly dryRun: boolean;
  /**
   * Optional row-level logger. The CLI passes a pretty-print function; tests
   * and programmatic callers can pass a silent one.
   */
  readonly onRow?: (row: ResetRow) => void;
}

export interface ResetRow {
  readonly table: string;
  readonly category: string;
  readonly action: 'wipe' | 'reset' | 'skip-keep';
  readonly count: number;
}

export interface ResetSummary {
  readonly tenantSlug: string;
  readonly tenantIntId: number;
  readonly companyName: string;
  readonly mode: ResetMode;
  readonly dryRun: boolean;
  readonly rows: readonly ResetRow[];
  readonly totalAffected: number;
  readonly durationMs: number;
}

const TRANSACTION_TIMEOUT_MS = 180_000;

/**
 * Null-outs that must happen BEFORE the registry runs, to avoid FK violations.
 *
 * - `Load.ediTenderId` references `EDIMessage`, which is wiped in both modes.
 * - `Load.trailerId` / `LoadLeg.trailerId` references `Trailer`. In hard mode
 *   trailers are deleted; in soft mode they stay — but a stale trailer FK on
 *   a deleted load would violate. Since loads are wiped in both modes, we
 *   null these before the load delete to be safe.
 * - `User.driverId` / `UserInvitation.driverId` references `Driver`. Only
 *   relevant in hard mode (drivers stay in soft). We null in hard to let the
 *   driver delete succeed before users are deleted.
 */
async function preDeletionNullouts(tx: Prisma.TransactionClient, tenantIntId: number, mode: ResetMode): Promise<void> {
  const where = { tenantId: tenantIntId };

  await tx.load.updateMany({
    where: { ...where, ediTenderId: { not: null } },
    data: { ediTenderId: null },
  });
  await tx.load.updateMany({
    where: { ...where, trailerId: { not: null } },
    data: { trailerId: null },
  });
  await tx.loadLeg.updateMany({
    where: { ...where, trailerId: { not: null } },
    data: { trailerId: null },
  });

  if (mode !== 'hard') return;

  await tx.user.updateMany({
    where: { ...where, driverId: { not: null } },
    data: { driverId: null },
  });
  await tx.userInvitation.updateMany({
    where: { ...where, driverId: { not: null } },
    data: { driverId: null },
  });
  // Trailer.assignedVehicleId → Vehicle. Null before vehicle delete.
  await tx.trailer.updateMany({
    where: { ...where, assignedVehicleId: { not: null } },
    data: { assignedVehicleId: null },
  });
}

/**
 * Count how many rows would be affected by each entry. Used by dry-run.
 * Intentionally NOT inside a transaction — reads only, can be slow on big
 * tenants but that's acceptable for a one-shot preview.
 */
async function countRows(
  prisma: PrismaClient,
  entries: readonly RegistryEntry[],
  tenantIntId: number,
  tenantSlug: string,
): Promise<ResetRow[]> {
  const rows: ResetRow[] = [];
  // Dry-run counts go through raw SQL instead of Prisma delegates because the
  // registry's `scope` is a `where` fragment, not a delegate reference — and
  // we don't want to duplicate the scope-→-delegate mapping.
  for (const entry of entries) {
    const count = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT count(*)::bigint AS count FROM "${entry.table}" WHERE ${buildCountPredicate(
        entry,
        tenantIntId,
        tenantSlug,
      )}`,
    );
    rows.push({
      table: entry.table,
      category: entry.category,
      action: entry.soft === 'reset' ? 'reset' : 'wipe',
      count: Number(count[0]?.count ?? 0),
    });
  }
  return rows;
}

/**
 * Builds a raw-SQL predicate for dry-run COUNT queries. Handles the three
 * scoping shapes declared in the registry.
 *
 * Safe against injection: tenantIntId is a number, tenantSlug comes from the
 * allowlist, and the predicate shape is hard-coded per scope type.
 */
function buildCountPredicate(entry: RegistryEntry, tenantIntId: number, tenantSlug: string): string {
  if (entry.scope === 'tenantId-int') {
    return `tenant_id = ${tenantIntId}`;
  }
  if (entry.scope === 'tenantId-string') {
    // Allowlist-validated earlier; still, escape single quotes defensively.
    const escaped = tenantSlug.replace(/'/g, "''");
    return `tenant_id = '${escaped}'`;
  }
  // Indirect scopes — parent relation. Map by table name.
  return INDIRECT_COUNT_PREDICATES[entry.table]?.(tenantIntId, tenantSlug) ?? 'false';
}

/**
 * Hand-maintained predicates for indirect-scope tables. Kept adjacent to the
 * registry so adding an indirect-scope entry requires adding the predicate
 * here too. The drift test asserts parity.
 */
const INDIRECT_COUNT_PREDICATES: Record<string, (tenantIntId: number, tenantSlug: string) => string> = {
  alert_notes: (t) => `alert_id IN (SELECT alert_id FROM alerts WHERE tenant_id = ${t})`,
  settlement_deductions: (t) => `settlement_id IN (SELECT id FROM settlements WHERE tenant_id = ${t})`,
  settlement_line_items: (t) => `settlement_id IN (SELECT id FROM settlements WHERE tenant_id = ${t})`,
  invoice_line_items: (t) => `invoice_id IN (SELECT id FROM invoices WHERE tenant_id = ${t})`,
  route_events: (t) => `plan_id IN (SELECT id FROM route_plans WHERE tenant_id = ${t})`,
  route_plan_loads: (t) => `plan_id IN (SELECT id FROM route_plans WHERE tenant_id = ${t})`,
  route_segments: (t) => `plan_id IN (SELECT id FROM route_plans WHERE tenant_id = ${t})`,
  load_charges: (t) => `load_id IN (SELECT id FROM loads WHERE tenant_id = ${t})`,
  load_notes: (t) => `load_id IN (SELECT id FROM loads WHERE tenant_id = ${t})`,
  load_events: (t) => `load_id IN (SELECT id FROM loads WHERE tenant_id = ${t})`,
  load_stops: (t) => `load_id IN (SELECT id FROM loads WHERE tenant_id = ${t})`,
  recurring_lane_stops: (t) => `lane_id IN (SELECT id FROM recurring_lanes WHERE tenant_id = ${t})`,
  conversation_messages: (t) => `conversation_id IN (SELECT id FROM conversations WHERE tenant_id = ${t})`,
  driver_preferences: (t) => `driver_id IN (SELECT id FROM drivers WHERE tenant_id = ${t})`,
  user_preferences: (t) => `user_id IN (SELECT id FROM users WHERE tenant_id = ${t})`,
  push_subscriptions: (t) => `user_id IN (SELECT id FROM users WHERE tenant_id = ${t})`,
  api_keys: (t) => `user_id IN (SELECT id FROM users WHERE tenant_id = ${t})`,
  refresh_tokens: (t) => `user_id IN (SELECT id FROM users WHERE tenant_id = ${t})`,
  super_admin_preferences: (t) => `user_id IN (SELECT id FROM users WHERE tenant_id = ${t})`,
  oauth_access_tokens: (t) => `client_id IN (SELECT id FROM oauth_clients WHERE tenant_id = ${t})`,
  oauth_refresh_tokens: (t) => `client_id IN (SELECT id FROM oauth_clients WHERE tenant_id = ${t})`,
  oauth_authorization_codes: (t) => `client_id IN (SELECT id FROM oauth_clients WHERE tenant_id = ${t})`,
  webhook_delivery_logs: (_t, s) => {
    const escaped = s.replace(/'/g, "''");
    return `subscription_id IN (SELECT id FROM webhook_subscriptions WHERE tenant_id = '${escaped}')`;
  },
  support_ticket_messages: (t) => `ticket_id IN (SELECT id FROM support_tickets WHERE tenant_id = ${t})`,
};

/**
 * Indirect-scope tables are kept in a constant so the drift test can verify
 * that every registry entry with a function-typed scope has a count predicate.
 */
export const INDIRECT_SCOPE_TABLES: readonly string[] = Object.freeze(Object.keys(INDIRECT_COUNT_PREDICATES));

/**
 * Executes the full reset inside a single transaction.
 *
 * Dry-run skips the transaction and returns zero-count rows from the registry
 * plus a raw COUNT(*) per table so the user sees what *would* be affected.
 */
export async function runReset(prisma: PrismaClient, options: ResetOptions): Promise<ResetSummary> {
  const safetyOptions: SafetyOptions = {
    tenantSlug: options.tenantSlug,
    mode: options.mode,
    yes: options.yes,
    hardConfirm: options.hardConfirm,
    dryRun: options.dryRun,
  };
  const { tenantIntId, tenantSlug, companyName } = await assertSafeToProceed(prisma, safetyOptions);

  const entries = entriesForMode(options.mode);
  const start = Date.now();

  if (options.dryRun) {
    const rows = await countRows(prisma, entries, tenantIntId, tenantSlug);
    for (const row of rows) options.onRow?.(row);
    return {
      tenantSlug,
      tenantIntId,
      companyName,
      mode: options.mode,
      dryRun: true,
      rows,
      totalAffected: rows.reduce((n, r) => n + r.count, 0),
      durationMs: Date.now() - start,
    };
  }

  const rows: ResetRow[] = [];

  await prisma.$transaction(
    async (tx) => {
      await preDeletionNullouts(tx, tenantIntId, options.mode);

      for (const entry of entries) {
        const count = await entry.run(tx, tenantIntId, tenantSlug, options.mode);
        const row: ResetRow = {
          table: entry.table,
          category: entry.category,
          action: entry.soft === 'reset' ? 'reset' : 'wipe',
          count,
        };
        rows.push(row);
        options.onRow?.(row);
      }

      if (options.mode === 'hard') {
        const { count } = await tx.tenant.deleteMany({
          where: { tenantId: tenantSlug },
        });
        const row: ResetRow = {
          table: 'tenants',
          category: 'tenant_config',
          action: 'wipe',
          count,
        };
        rows.push(row);
        options.onRow?.(row);
      }
    },
    { timeout: TRANSACTION_TIMEOUT_MS },
  );

  // Include skipped `keep` entries in the summary so the user sees the full
  // picture of what was considered vs. acted on. Non-emitting — just the
  // summary rows array, not the onRow stream.
  const allRows = [...rows];
  if (options.mode === 'soft') {
    for (const entry of REGISTRY) {
      if (entry.soft !== 'keep') continue;
      allRows.push({
        table: entry.table,
        category: entry.category,
        action: 'skip-keep',
        count: 0,
      });
    }
  }

  return {
    tenantSlug,
    tenantIntId,
    companyName,
    mode: options.mode,
    dryRun: false,
    rows: allRows,
    totalAffected: rows.reduce((n, r) => n + r.count, 0),
    durationMs: Date.now() - start,
  };
}

export async function soft(
  prisma: PrismaClient,
  tenantSlug: string,
  opts: Partial<Omit<ResetOptions, 'tenantSlug' | 'mode'>> = {},
): Promise<ResetSummary> {
  return runReset(prisma, {
    tenantSlug,
    mode: 'soft',
    yes: opts.yes ?? false,
    hardConfirm: false,
    dryRun: opts.dryRun ?? false,
    onRow: opts.onRow,
  });
}

export async function hard(
  prisma: PrismaClient,
  tenantSlug: string,
  opts: Partial<Omit<ResetOptions, 'tenantSlug' | 'mode'>> = {},
): Promise<ResetSummary> {
  return runReset(prisma, {
    tenantSlug,
    mode: 'hard',
    yes: opts.yes ?? false,
    hardConfirm: opts.hardConfirm ?? false,
    dryRun: opts.dryRun ?? false,
    onRow: opts.onRow,
  });
}
