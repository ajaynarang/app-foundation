/**
 * Tenant reset: the delete engine.
 *
 *   runReset(prisma, options)   the gated entry point the CLI calls
 *   deleteTenantData(tx, …)     the ordered deletes, inside a transaction the caller opened
 *   countTenantData(db, …)      what a run would delete, for the dry run
 *
 * A run is one interactive transaction: it deletes everything or nothing. Users are the delicate part. A user's home
 * workspace is `User.tenantId`, but one account can belong to several workspaces (`WorkspaceMember`). Hard mode
 * therefore deletes only users homed here who belong to no other workspace; a user homed here who is also a member
 * elsewhere is moved to that workspace (the same write a workspace switch makes) and keeps their account.
 */
import {
  MASTRA_MEMORY_TABLES,
  REGISTRY,
  entriesForMode,
  mastraResourcePattern,
  type RegistryEntry,
  type ResetContext,
  type ResetDelegate,
  type ResetMode,
} from './registry';
import { SafetyError, assertSafeToProceed, type TenantLookup } from './safety';

export interface ResetRow {
  readonly table: string;
  readonly category: string;
  readonly action: 'wipe' | 'rehome' | 'skip-keep';
  readonly count: number;
}

export interface ResetSummary {
  readonly tenantId: string;
  readonly tenantDbId: number;
  readonly companyName: string;
  readonly mode: ResetMode;
  readonly dryRun: boolean;
  readonly rows: readonly ResetRow[];
  readonly totalAffected: number;
  readonly durationMs: number;
}

export interface ResetOptions {
  readonly tenantId: string;
  readonly mode: ResetMode;
  readonly yes: boolean;
  readonly hardConfirm: boolean;
  readonly dryRun: boolean;
  /** Called once per table as it is counted or deleted. The CLI prints it; tests collect it. */
  readonly onRow?: (row: ResetRow) => void;
}

/** A large tenant takes a while; the transaction gets three minutes, not Prisma's five seconds. */
export const TRANSACTION_TIMEOUT_MS = 180_000;

interface UserRow {
  id: number;
}
interface MembershipRow {
  tenantId: number;
  role: string;
}

/**
 * The client surface the engine uses. A `PrismaClient` and a transaction client both satisfy it; every model
 * delegate a registry entry names is read from it by name.
 */
export interface ResetDb {
  user: {
    findMany(args: Record<string, unknown>): Promise<UserRow[]>;
    update(args: Record<string, unknown>): Promise<unknown>;
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  };
  workspaceMember: {
    findFirst(args: Record<string, unknown>): Promise<MembershipRow | null>;
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  };
  announcement: { count(args: Record<string, unknown>): Promise<number> };
  tenant: { delete(args: { where: { id: number } }): Promise<unknown> } & TenantLookup['tenant'];
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}

export interface ResetClient extends ResetDb {
  $transaction<T>(fn: (tx: ResetDb) => Promise<T>, options?: { timeout?: number; maxWait?: number }): Promise<T>;
}

/** Users homed in the tenant, split by whether they belong to another workspace too. */
const homedHere = (tenantDbId: number) => ({ tenantId: tenantDbId });
const memberElsewhere = (tenantDbId: number) => ({ memberships: { some: { tenantId: { not: tenantDbId } } } });

/** Builds the context: in hard mode, the users the reset deletes. Soft mode deletes no user. */
export async function buildContext(
  db: ResetDb,
  tenant: { tenantDbId: number; tenantId: string },
  mode: ResetMode,
): Promise<ResetContext> {
  let deletableUserIds: number[] = [];
  if (mode === 'hard') {
    const users = await db.user.findMany({
      where: { ...homedHere(tenant.tenantDbId), NOT: memberElsewhere(tenant.tenantDbId) },
      select: { id: true },
    });
    deletableUserIds = users.map((u) => u.id);
  }
  return { tenantDbId: tenant.tenantDbId, tenantId: tenant.tenantId, deletableUserIds };
}

/**
 * Rows outside the tenant that would stop a hard reset: platform rows (announcements) written by a user it deletes.
 * Reported before anything is deleted, so the operator reassigns or removes them.
 */
export async function findHardBlockers(db: ResetDb, ctx: ResetContext): Promise<string[]> {
  if (ctx.deletableUserIds.length === 0) return [];
  const announcements = await db.announcement.count({
    where: { createdById: { in: [...ctx.deletableUserIds] } },
  });
  return announcements > 0
    ? [`${announcements} announcement(s) were written by a user this reset deletes. Delete or reassign them first.`]
    : [];
}

/** Users homed in the tenant who also belong to another workspace. Hard mode moves them there. */
export async function findUsersToRehome(db: ResetDb, tenantDbId: number): Promise<number[]> {
  const users = await db.user.findMany({
    where: { ...homedHere(tenantDbId), ...memberElsewhere(tenantDbId) },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

/** Moves each user to their other workspace: the default one if they have it, else the oldest membership. */
async function rehomeUsers(tx: ResetDb, tenantDbId: number, userIds: readonly number[]): Promise<number> {
  for (const userId of userIds) {
    const target = await tx.workspaceMember.findFirst({
      where: { userId, tenantId: { not: tenantDbId } },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      select: { tenantId: true, role: true },
    });
    if (!target) continue;
    await tx.user.update({ where: { id: userId }, data: { tenantId: target.tenantId, role: target.role } });
    await tx.workspaceMember.updateMany({
      where: { userId, tenantId: target.tenantId },
      data: { isDefault: true },
    });
  }
  return userIds.length;
}

function delegateOf(db: ResetDb, entry: RegistryEntry): ResetDelegate {
  const delegate = (db as unknown as Record<string, ResetDelegate | undefined>)[entry.delegate];
  if (!delegate) {
    throw new Error(`Tenant reset: the Prisma client has no "${entry.delegate}" delegate (table ${entry.table}).`);
  }
  return delegate;
}

async function mastraColumnExists(db: ResetDb, table: string, column: string): Promise<boolean> {
  const rows = await db.$queryRawUnsafe<{ exists: boolean }[]>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2
     ) AS exists`,
    table,
    column,
  );
  return rows[0]?.exists === true;
}

/** Messages also go by their thread: a message row may carry no resource id of its own. */
function mastraWhere(table: string, column: string): string {
  const own = `"${column}" LIKE $1`;
  return table === 'mastra_messages'
    ? `${own} OR thread_id IN (SELECT id FROM mastra_threads WHERE "resourceId" LIKE $1)`
    : own;
}

/** Counts (dry run) or deletes (run) the tenant's Mastra chat memory. Messages first: they are matched by thread. */
async function mastraMemory(db: ResetDb, tenantDbId: number, execute: boolean): Promise<ResetRow[]> {
  const rows: ResetRow[] = [];
  for (const { table, column } of MASTRA_MEMORY_TABLES) {
    let count = 0;
    if (await mastraColumnExists(db, table, column)) {
      const where = mastraWhere(table, column);
      const pattern = mastraResourcePattern(tenantDbId);
      if (execute) {
        count = await db.$executeRawUnsafe(`DELETE FROM ${table} WHERE ${where}`, pattern);
      } else {
        const result = await db.$queryRawUnsafe<{ count: bigint | number }[]>(
          `SELECT count(*)::bigint AS count FROM ${table} WHERE ${where}`,
          pattern,
        );
        count = Number(result[0]?.count ?? 0);
      }
    }
    rows.push({ table, category: 'ai', action: 'wipe', count });
  }
  return rows;
}

/**
 * The ordered deletes, inside the caller's transaction. Hard mode first moves users who belong to another workspace,
 * clears soft-delete pointers at the users it deletes, and deletes the tenant row last.
 */
export async function deleteTenantData(
  tx: ResetDb,
  tenant: { tenantDbId: number; tenantId: string },
  mode: ResetMode,
  onRow?: (row: ResetRow) => void,
): Promise<ResetRow[]> {
  const rows: ResetRow[] = [];
  const emit = (row: ResetRow) => {
    rows.push(row);
    onRow?.(row);
  };

  if (mode === 'hard') {
    const rehomed = await rehomeUsers(tx, tenant.tenantDbId, await findUsersToRehome(tx, tenant.tenantDbId));
    emit({ table: 'users', category: 'users', action: 'rehome', count: rehomed });
  }
  const ctx = await buildContext(tx, tenant, mode);
  if (mode === 'hard') {
    const blockers = await findHardBlockers(tx, ctx);
    if (blockers.length > 0) throw new SafetyError(blockers.join('\n'));
    if (ctx.deletableUserIds.length > 0) {
      await tx.user.updateMany({
        where: { deletedBy: { in: [...ctx.deletableUserIds] } },
        data: { deletedBy: null },
      });
    }
  }

  for (const row of await mastraMemory(tx, tenant.tenantDbId, true)) emit(row);

  for (const entry of entriesForMode(mode)) {
    const { count } = await delegateOf(tx, entry).deleteMany({ where: entry.where(ctx) });
    emit({ table: entry.table, category: entry.category, action: 'wipe', count });
  }

  if (mode === 'hard') {
    await tx.tenant.delete({ where: { id: tenant.tenantDbId } });
    emit({ table: 'tenants', category: 'config', action: 'wipe', count: 1 });
  }
  return rows;
}

/** What a run would delete, by table. Reads only, outside any transaction. */
export async function countTenantData(
  db: ResetDb,
  tenant: { tenantDbId: number; tenantId: string },
  mode: ResetMode,
): Promise<{ rows: ResetRow[]; blockers: string[] }> {
  const rows: ResetRow[] = [];
  let blockers: string[] = [];
  if (mode === 'hard') {
    const rehome = await findUsersToRehome(db, tenant.tenantDbId);
    rows.push({ table: 'users', category: 'users', action: 'rehome', count: rehome.length });
  }
  const ctx = await buildContext(db, tenant, mode);
  if (mode === 'hard') blockers = await findHardBlockers(db, ctx);
  rows.push(...(await mastraMemory(db, tenant.tenantDbId, false)));
  for (const entry of entriesForMode(mode)) {
    const count = await delegateOf(db, entry).count({ where: entry.where(ctx) });
    rows.push({ table: entry.table, category: entry.category, action: 'wipe', count });
  }
  if (mode === 'hard') rows.push({ table: 'tenants', category: 'config', action: 'wipe', count: 1 });
  return { rows, blockers };
}

/** The kept tables, listed in a soft run's summary so the operator sees what was left alone. */
function keptRows(mode: ResetMode): ResetRow[] {
  if (mode !== 'soft') return [];
  return REGISTRY.filter((e) => e.soft === 'keep').map((e) => ({
    table: e.table,
    category: e.category,
    action: 'skip-keep' as const,
    count: 0,
  }));
}

const affected = (rows: readonly ResetRow[]) =>
  rows.filter((r) => r.action === 'wipe').reduce((n, r) => n + r.count, 0);

/** The gated run: every safety check, then a dry-run count or one transaction. */
export async function runReset(prisma: ResetClient, options: ResetOptions): Promise<ResetSummary> {
  const tenant = await assertSafeToProceed(prisma, options);
  const start = Date.now();
  const base = { tenantId: tenant.tenantId, tenantDbId: tenant.tenantDbId, companyName: tenant.companyName };

  if (options.dryRun) {
    const { rows, blockers } = await countTenantData(prisma, tenant, options.mode);
    for (const row of rows) options.onRow?.(row);
    if (blockers.length > 0) {
      throw new SafetyError(`A hard reset would be refused:\n${blockers.join('\n')}`);
    }
    return {
      ...base,
      mode: options.mode,
      dryRun: true,
      rows: [...rows, ...keptRows(options.mode)],
      totalAffected: affected(rows),
      durationMs: Date.now() - start,
    };
  }

  const rows = await prisma.$transaction((tx) => deleteTenantData(tx, tenant, options.mode, options.onRow), {
    timeout: TRANSACTION_TIMEOUT_MS,
  });
  return {
    ...base,
    mode: options.mode,
    dryRun: false,
    rows: [...rows, ...keptRows(options.mode)],
    totalAffected: affected(rows),
    durationMs: Date.now() - start,
  };
}
