import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';

/**
 * Migration `drop_ai_reader_role` removes the `ai_reader` role that the deleted AI RLS wrapper switched to.
 *
 * Roles are cluster-wide in Postgres, but grants live in each database. So the migration revokes the grants the old
 * migration (`20260611000001_ai_reader_rls`) made in this database, then drops the role inside a block that turns
 * "another database still holds grants" into a notice. A shadow database or a second product on the same server must
 * never make this migration fail.
 *
 * The database cases run the migration's own SQL against `DATABASE_URL` with the role name swapped for a throwaway
 * probe role, so the shared `ai_reader` role of that server is never touched. They skip when `DATABASE_URL` is unset,
 * and need a migrated database (the three tables the old migration granted on).
 */

const MIGRATIONS_DIR = path.resolve(__dirname, '..', '..', 'prisma', 'migrations');
const NAME = 'drop_ai_reader_role';

function migrationFolders(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

function migrationSql(): string {
  const folder = migrationFolders().find((f) => f.endsWith(`_${NAME}`));
  if (!folder) throw new Error(`no migration named *_${NAME}`);
  return fs.readFileSync(path.join(MIGRATIONS_DIR, folder, 'migration.sql'), 'utf8');
}

describe(`migration ${NAME}`, () => {
  it('exists once and sorts after drop_dead_ai_rls, which stops the code from using the role', () => {
    const folders = migrationFolders();
    const drop = folders.filter((f) => f.endsWith(`_${NAME}`));
    expect(drop).toHaveLength(1);
    const deadRls = folders.findIndex((f) => f.endsWith('_drop_dead_ai_rls'));
    expect(deadRls).toBeGreaterThanOrEqual(0);
    expect(folders.indexOf(drop[0])).toBeGreaterThan(deadRls);
  });

  const databaseUrl = process.env.DATABASE_URL;
  const withDb = databaseUrl ? describe : describe.skip;

  withDb('against a database (DATABASE_URL)', () => {
    let client: Client;
    let notices: string[];
    const probe = `ai_reader_probe_${process.pid}_${Date.now()}`;

    const roleExists = async () =>
      (await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [probe])).rowCount === 1;

    /** The grants `20260611000001_ai_reader_rls` makes, for the probe role. */
    const grantLikeTheOldMigration = async () => {
      await client.query(`CREATE ROLE ${probe} NOLOGIN`);
      await client.query(`GRANT USAGE ON SCHEMA public TO ${probe}`);
      await client.query(`GRANT SELECT ON knowledge_documents, conversations, conversation_messages TO ${probe}`);
      await client.query(`GRANT ${probe} TO current_user`);
    };

    const runMigration = () => client.query(migrationSql().replace(/\bai_reader\b/g, probe));

    beforeAll(async () => {
      client = new Client({ connectionString: databaseUrl });
      await client.connect();
      client.on('notice', (n) => notices.push(n.message ?? ''));
    });

    beforeEach(() => {
      notices = [];
    });

    afterEach(async () => {
      if (await roleExists()) {
        await client.query(`REVOKE ALL ON SCHEMA public FROM ${probe}`);
        await client.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${probe}`);
        await client.query(`DROP ROLE ${probe}`);
      }
    });

    afterAll(async () => {
      await client?.end();
    });

    it('revokes the old grants and drops the role', async () => {
      await grantLikeTheOldMigration();
      await runMigration();
      expect(await roleExists()).toBe(false);
    });

    it('raises a notice and succeeds when the role still holds a grant it does not revoke', async () => {
      // Stands in for a grant in another database on the same server (a shadow database, a second product).
      await grantLikeTheOldMigration();
      await client.query(`GRANT SELECT ON _prisma_migrations TO ${probe}`);
      await expect(runMigration()).resolves.toBeDefined();
      expect(await roleExists()).toBe(true);
      expect(notices.some((n) => n.includes(probe) && n.includes('not dropped'))).toBe(true);
      // The grants it owns in this database are gone all the same.
      const left = await client.query(
        `SELECT table_name FROM information_schema.role_table_grants WHERE grantee = $1 ORDER BY table_name`,
        [probe],
      );
      expect(left.rows.map((r: { table_name: string }) => r.table_name)).toEqual(['_prisma_migrations']);
    });

    it('is a no-op when the role does not exist', async () => {
      expect(await roleExists()).toBe(false);
      await expect(runMigration()).resolves.toBeDefined();
      expect(await roleExists()).toBe(false);
    });
  });
});
