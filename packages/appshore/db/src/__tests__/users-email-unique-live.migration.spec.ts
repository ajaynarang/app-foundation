import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';
import {
  CREATE_EMAIL_UNIQUE_INDEX_SQL,
  EMAIL_UNIQUE_INDEX,
  EMAIL_UNIQUE_INDEX_LOCK_KEY,
  emailUniqueIndexExists,
  enforceUniqueEmail,
} from '../email-uniqueness';

/**
 * Migration `users_email_unique_live`: one live account per email, as a partial unique index on lower(email).
 *
 * It must never fail a deploy, so with duplicates it skips itself with a notice. The skip, the creation and the
 * enforce script run against a throwaway schema holding a copy of the `users` columns (`search_path` points there),
 * so the shared database's own index is never touched. The last case checks the migrated database itself: on a clean
 * database the index is there and a second live account with the same email is refused.
 *
 * The database cases skip when DATABASE_URL is unset, and need a migrated database.
 */

const MIGRATIONS_DIR = path.resolve(__dirname, '..', '..', 'prisma', 'migrations');
const NAME = 'users_email_unique_live';

const migrationFolders = (): string[] =>
  fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

const migrationSql = (): string => {
  const folder = migrationFolders().find((f) => f.endsWith(`_${NAME}`));
  if (!folder) throw new Error(`no migration named *_${NAME}`);
  return fs.readFileSync(path.join(MIGRATIONS_DIR, folder, 'migration.sql'), 'utf8');
};

describe(`migration ${NAME}`, () => {
  it('exists once and sorts after the refresh-token migrations below it', () => {
    const folders = migrationFolders();
    const mine = folders.filter((f) => f.endsWith(`_${NAME}`));
    expect(mine).toHaveLength(1);
    const reuse = folders.findIndex((f) => f.endsWith('_login_fail_reason_refresh_reuse'));
    expect(reuse).toBeGreaterThanOrEqual(0);
    expect(folders.indexOf(mine[0])).toBeGreaterThan(reuse);
  });

  it('creates the same index the boot check and the enforce script look for', () => {
    const sql = migrationSql();
    expect(sql).toContain(CREATE_EMAIL_UNIQUE_INDEX_SQL);
    expect(CREATE_EMAIL_UNIQUE_INDEX_SQL).toContain(`"${EMAIL_UNIQUE_INDEX}"`);
  });

  it('changes no existing row', () => {
    expect(migrationSql()).not.toMatch(/\b(UPDATE|DELETE|DROP|ALTER TABLE)\b/i);
  });

  const databaseUrl = process.env.DATABASE_URL;
  const withDb = databaseUrl ? describe : describe.skip;

  withDb('against a throwaway copy of users (DATABASE_URL)', () => {
    let client: Client;
    let notices: string[] = [];
    const schema = `email_unique_probe_${process.pid}_${crypto.randomBytes(3).toString('hex')}`;
    let n = 0;

    const insertUser = (email: string | null, deleted = false) =>
      client.query(
        `INSERT INTO users (user_id, email, first_name, last_name, role, is_active, deleted_at, created_at, updated_at)
         VALUES ($1, $2, 'Probe', 'Spec', 'ADMIN', true, $3, now(), now())`,
        [`user_probe_${++n}`, email, deleted ? new Date() : null],
      );
    const runMigration = () => client.query(migrationSql());

    beforeAll(async () => {
      client = new Client({ connectionString: databaseUrl });
      await client.connect();
      client.on('notice', (msg) => notices.push(msg.message ?? ''));
      await client.query(`CREATE SCHEMA ${schema}`);
      // Columns, defaults and NOT NULLs only: no indexes, no foreign keys, so duplicates can be written.
      await client.query(`CREATE TABLE ${schema}.users (LIKE public.users INCLUDING DEFAULTS)`);
      await client.query(`SET search_path TO ${schema}, public`);
    });

    beforeEach(async () => {
      await client.query(`DROP INDEX IF EXISTS ${schema}."${EMAIL_UNIQUE_INDEX}"`);
      await client.query('DELETE FROM users');
      notices = [];
    });

    afterAll(async () => {
      if (!client) return;
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await client.end();
    });

    it('with two live accounts on one email (any case), skips the index with a notice and does not fail', async () => {
      await insertUser('same@example.com');
      await insertUser('Same@Example.com');
      await expect(runMigration()).resolves.toBeDefined();
      expect(await emailUniqueIndexExists(client)).toBe(false);
      expect(notices.join('\n')).toMatch(/users_email_live_key not created: 1 email\(s\)/);
    });

    it('a soft-deleted twin and NULL emails are not duplicates: the index is created', async () => {
      await insertUser('same@example.com');
      await insertUser('same@example.com', true);
      await insertUser(null);
      await insertUser(null);
      await runMigration();
      expect(await emailUniqueIndexExists(client)).toBe(true);
      expect(notices).toEqual([]);
    });

    it('once created, refuses a second live account with the same email in any case, and frees it on soft delete', async () => {
      await runMigration();
      await insertUser('one@example.com');
      await expect(insertUser('ONE@example.com')).rejects.toMatchObject({ code: '23505' });
      await client.query(`UPDATE users SET deleted_at = now() WHERE lower(email) = 'one@example.com'`);
      await expect(insertUser('one@example.com')).resolves.toBeDefined();
    });

    it('runs again without error when the index already exists', async () => {
      await runMigration();
      await expect(runMigration()).resolves.toBeDefined();
      expect(await emailUniqueIndexExists(client)).toBe(true);
    });

    it('enforce script: refuses while duplicates remain, creates once they are merged, then reports it is done', async () => {
      await insertUser('a@example.com');
      await insertUser('A@example.com');
      expect(await enforceUniqueEmail(client)).toEqual({ status: 'duplicates', duplicateEmails: 1 });
      expect(await emailUniqueIndexExists(client)).toBe(false);

      await client.query(`UPDATE users SET deleted_at = now() WHERE email = 'A@example.com'`);
      expect(await enforceUniqueEmail(client)).toEqual({ status: 'created' });
      expect(await emailUniqueIndexExists(client)).toBe(true);
      expect(await enforceUniqueEmail(client)).toEqual({ status: 'already-enforced' });
      // The script waits for the shared advisory lock, which another package's spec may be holding.
    }, 60_000);
  });

  withDb('on the migrated database (DATABASE_URL)', () => {
    let client: Client;
    const suffix = crypto.randomBytes(4).toString('hex');
    const tenantIds: number[] = [];

    beforeAll(async () => {
      client = new Client({ connectionString: databaseUrl });
      await client.connect();
      // Specs that need duplicates drop the index under this lock and restore it; wait for them.
      await client.query('SELECT pg_advisory_lock($1)', [EMAIL_UNIQUE_INDEX_LOCK_KEY]);
    }, 60_000);

    afterAll(async () => {
      if (!client) return;
      await client.query('DELETE FROM users WHERE user_id LIKE $1', [`user_uq_%_${suffix}`]);
      if (tenantIds.length) await client.query('DELETE FROM tenants WHERE id = ANY($1)', [tenantIds]);
      await client.query('SELECT pg_advisory_unlock($1)', [EMAIL_UNIQUE_INDEX_LOCK_KEY]);
      await client.end();
    });

    it('has the index, and refuses a second live account with the same email in another tenant', async () => {
      // Absent means this database held duplicate accounts when it was migrated: run `pnpm accounts:duplicates`.
      expect(await emailUniqueIndexExists(client)).toBe(true);

      for (const name of ['a', 'b']) {
        const { rows } = await client.query(
          `INSERT INTO tenants (tenant_id, company_name, status, is_active, created_at, updated_at)
           VALUES ($1, $2, 'ACTIVE', true, now(), now()) RETURNING id`,
          [`ten_uq_${name}_${suffix}`, `Unique ${name}`],
        );
        tenantIds.push(rows[0].id);
      }
      const insertUser = (n: number, email: string) =>
        client.query(
          `INSERT INTO users (user_id, tenant_id, email, first_name, last_name, role, is_active, created_at, updated_at)
           VALUES ($1, $2, $3, 'Unique', 'Spec', 'ADMIN', true, now(), now())`,
          [`user_uq_${n}_${suffix}`, tenantIds[n], email],
        );
      await insertUser(0, `uq-${suffix}@example.com`);
      await expect(insertUser(1, `UQ-${suffix}@Example.com`)).rejects.toMatchObject({
        code: '23505',
        constraint: EMAIL_UNIQUE_INDEX,
      });
    });
  });
});
