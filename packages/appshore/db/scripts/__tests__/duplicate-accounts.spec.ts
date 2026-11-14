import pg from 'pg';
import * as crypto from 'crypto';
import { findDuplicateAccounts, formatDuplicateReport } from '../duplicate-accounts';
import { emailUniqueIndexExists } from '../../src/email-uniqueness';

describe('duplicate-accounts report', () => {
  const row = (email: string, userId: string, tenantId: string | null) => ({
    email,
    user_id: userId,
    role: 'ADMIN',
    is_active: true,
    tenant_id: tenantId,
    company_name: tenantId ? `Name of ${tenantId}` : null,
    workspace_count: '1',
    created_at: new Date('2026-01-02T00:00:00Z'),
    last_login_at: null,
  });

  it('groups the rows by email, accounts in query order', async () => {
    const db = {
      query: jest.fn(async () => ({
        rows: [
          row('a@example.com', 'user_1', 'ten_a'),
          row('a@example.com', 'user_2', 'ten_b'),
          row('b@example.com', 'user_3', null),
        ],
      })),
    };
    const groups = await findDuplicateAccounts(db as any);
    expect(groups.map((g) => [g.email, g.accounts.map((a) => a.userId)])).toEqual([
      ['a@example.com', ['user_1', 'user_2']],
      ['b@example.com', ['user_3']],
    ]);
    expect(groups[0].accounts[0]).toMatchObject({ tenantId: 'ten_a', workspaceCount: 1, lastLoginAt: null });
    // Live accounts only, case-insensitive: the same rule the unique index will use.
    const sql = (db.query.mock.calls[0] as unknown[])[0] as string;
    expect(sql).toMatch(/deleted_at IS NULL/);
    expect(sql).toMatch(/lower\(email\)/);
  });

  it('says so when there is nothing to merge', () => {
    expect(formatDuplicateReport([])).toMatch(/No duplicate accounts/);
  });

  it('prints each group with its accounts and the merge pointer', () => {
    const text = formatDuplicateReport([
      {
        email: 'a@example.com',
        accounts: [
          {
            userId: 'user_1',
            role: 'OWNER',
            isActive: true,
            tenantId: 'ten_a',
            tenantName: 'Acme',
            workspaceCount: 2,
            createdAt: '2026-01-02T00:00:00.000Z',
            lastLoginAt: '2026-03-04T00:00:00.000Z',
          },
          {
            userId: 'user_2',
            role: 'MEMBER',
            isActive: false,
            tenantId: null,
            tenantName: null,
            workspaceCount: 0,
            createdAt: '2026-02-02T00:00:00.000Z',
            lastLoginAt: null,
          },
        ],
      },
    ]);
    expect(text).toContain('1 email(s) shared by 2 live accounts');
    expect(text).toContain('Duplicate accounts');
    expect(text).toContain(
      'user_1  OWNER  active  Acme (ten_a)  2 workspace(s)  created 2026-01-02  last sign-in 2026-03-04',
    );
    expect(text).toContain(
      'user_2  MEMBER  disabled  no workspace  0 workspace(s)  created 2026-02-02  never signed in',
    );
  });
});

/**
 * Against real Postgres: two live accounts in two tenants, emails differing only by case; a deleted third.
 *
 * A migrated database refuses that pair (index `users_email_live_key`), so the spec plays a database from before the
 * index in a throwaway schema: copies of `users`, `tenants` and `workspace_members` (columns and defaults only, no
 * indexes) with `search_path` pointing there. The shared database's own index is never touched, so a killed run
 * leaves at most an orphan `dup_report_probe_*` schema behind, never a database without the rule.
 */
describe('duplicate-accounts report (Postgres)', () => {
  // No default: the spec writes rows, so it runs only against a database someone named.
  const DATABASE_URL = process.env.DATABASE_URL;
  const suffix = crypto.randomBytes(4).toString('hex');
  const schema = `dup_report_probe_${process.pid}_${suffix}`;
  let client: pg.Client | undefined;
  const tenantIds: number[] = [];

  beforeAll(async () => {
    if (!DATABASE_URL) {
      console.warn('duplicate-accounts (Postgres): DATABASE_URL is unset — skipping');
      return;
    }
    const candidate = new pg.Client({ connectionString: DATABASE_URL });
    try {
      await candidate.connect();
      await candidate.query('SELECT 1 FROM users LIMIT 1');
      client = candidate;
    } catch (err) {
      console.warn(`duplicate-accounts (Postgres): no usable database (${(err as Error).message}) — skipping`);
      await candidate.end().catch(() => undefined);
      return;
    }
    await client.query(`CREATE SCHEMA ${schema}`);
    for (const table of ['tenants', 'users', 'workspace_members']) {
      await client.query(`CREATE TABLE ${schema}.${table} (LIKE public.${table} INCLUDING DEFAULTS)`);
    }
    await client.query(`SET search_path TO ${schema}, public`);
    // The report must see a database without the rule, or the pair below could not exist.
    expect(await emailUniqueIndexExists(client)).toBe(false);

    for (const name of ['a', 'b', 'c']) {
      const { rows } = await client.query(
        `INSERT INTO tenants (tenant_id, company_name, status, is_active, created_at, updated_at)
         VALUES ($1, $2, 'ACTIVE', true, now(), now()) RETURNING id`,
        [`ten_dup_${name}_${suffix}`, `Dup ${name}`],
      );
      tenantIds.push(rows[0].id);
    }
    const insertUser = (n: number, email: string, deleted: boolean) =>
      client!.query(
        `INSERT INTO users (user_id, tenant_id, email, first_name, last_name, role, is_active, deleted_at, created_at, updated_at)
         VALUES ($1, $2, $3, 'Dup', 'Spec', 'ADMIN', true, $4, now(), now())`,
        [`user_dup_${n}_${suffix}`, tenantIds[n], email, deleted ? new Date() : null],
      );
    await insertUser(0, `dup-${suffix}@example.com`, false);
    await insertUser(1, `Dup-${suffix}@Example.com`, false);
    await insertUser(2, `dup-${suffix}@example.com`, true);
  });

  afterAll(async () => {
    if (!client) return;
    try {
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    } finally {
      await client.end();
    }
  });

  it('lists the two live accounts under one lowercased email and leaves the deleted one out', async () => {
    if (!client) return;
    const groups = await findDuplicateAccounts(client);
    const ours = groups.find((g) => g.email === `dup-${suffix}@example.com`);
    expect(ours?.accounts.map((a) => a.userId)).toEqual([`user_dup_0_${suffix}`, `user_dup_1_${suffix}`]);
  });
});
