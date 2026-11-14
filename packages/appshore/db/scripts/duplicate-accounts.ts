/**
 * Duplicate accounts report — every email that more than one live account shares.
 *
 *   pnpm --filter @appshore/db accounts:duplicates          # a readable list
 *   pnpm --filter @appshore/db accounts:duplicates --json   # the same, as JSON
 *
 * `User` is unique only on (tenantId, email), so a product scaffolded before one-account-per-email can hold several
 * live accounts behind one address. Login copes (it checks each and answers 409 when the password matches more than
 * one), but the database index that enforces one live account per email cannot be created while any remain. This
 * report lists them so an operator can merge them by the procedure in `docs/operations.md` ("Duplicate accounts").
 *
 * Emails compare case-insensitively and soft-deleted accounts do not count, the same rule the index will use. The
 * report reads only. It needs DATABASE_URL and exits non-zero without it; it exits 0 whether or not it finds
 * duplicates.
 */
import pg from 'pg';

export interface DuplicateAccount {
  userId: string;
  role: string;
  isActive: boolean;
  tenantId: string | null;
  tenantName: string | null;
  workspaceCount: number;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface DuplicateGroup {
  /** The address, lowercased. */
  email: string;
  accounts: DuplicateAccount[];
}

interface Queryable {
  query<R extends pg.QueryResultRow>(text: string): Promise<{ rows: R[] }>;
}

interface Row extends pg.QueryResultRow {
  email: string;
  user_id: string;
  role: string;
  is_active: boolean;
  tenant_id: string | null;
  company_name: string | null;
  workspace_count: string | number;
  created_at: Date;
  last_login_at: Date | null;
}

// Raw SQL on the mapped names (foundation.prisma @@map / @map).
const DUPLICATES_SQL = `
  WITH dup AS (
    SELECT lower(email) AS email
    FROM users
    WHERE deleted_at IS NULL AND email IS NOT NULL
    GROUP BY lower(email)
    HAVING count(*) > 1
  )
  SELECT dup.email, u.user_id, u.role, u.is_active, t.tenant_id, t.company_name,
         (SELECT count(*) FROM workspace_members wm WHERE wm.user_id = u.id) AS workspace_count,
         u.created_at, u.last_login_at
  FROM dup
  JOIN users u ON lower(u.email) = dup.email AND u.deleted_at IS NULL
  LEFT JOIN tenants t ON t.id = u.tenant_id
  ORDER BY dup.email, u.id`;

/** Every email shared by more than one live account, each with its accounts oldest first. */
export async function findDuplicateAccounts(db: Queryable): Promise<DuplicateGroup[]> {
  const { rows } = await db.query<Row>(DUPLICATES_SQL);
  const groups = new Map<string, DuplicateGroup>();
  for (const row of rows) {
    const group = groups.get(row.email) ?? { email: row.email, accounts: [] };
    group.accounts.push({
      userId: row.user_id,
      role: row.role,
      isActive: row.is_active,
      tenantId: row.tenant_id,
      tenantName: row.company_name,
      workspaceCount: Number(row.workspace_count),
      createdAt: new Date(row.created_at).toISOString(),
      lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null,
    });
    groups.set(row.email, group);
  }
  return [...groups.values()];
}

/** The human-readable report. */
export function formatDuplicateReport(groups: DuplicateGroup[]): string {
  if (groups.length === 0) {
    return 'No duplicate accounts: every live email belongs to one account. The unique-email index can be created.';
  }
  const accounts = groups.reduce((sum, group) => sum + group.accounts.length, 0);
  const lines = [
    `${groups.length} email(s) shared by ${accounts} live accounts. Merge each group (docs/operations.md, "Duplicate accounts"):`,
    '',
  ];
  for (const group of groups) {
    lines.push(group.email);
    for (const a of group.accounts) {
      const workspace = a.tenantId ? `${a.tenantName ?? '?'} (${a.tenantId})` : 'no workspace';
      const status = a.isActive ? 'active' : 'disabled';
      const lastLogin = a.lastLoginAt ? `last sign-in ${a.lastLoginAt.slice(0, 10)}` : 'never signed in';
      lines.push(
        `  ${a.userId}  ${a.role}  ${status}  ${workspace}  ${a.workspaceCount} workspace(s)  created ${a.createdAt.slice(0, 10)}  ${lastLogin}`,
      );
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

async function main(): Promise<number> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('accounts:duplicates: DATABASE_URL is not set. Point it at the database to report on.');
    return 2;
  }
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const groups = await findDuplicateAccounts(client);
    console.log(process.argv.includes('--json') ? JSON.stringify(groups, null, 2) : formatDuplicateReport(groups));
    return 0;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(`accounts:duplicates failed: ${(err as Error).message}`);
      process.exit(1);
    },
  );
}
