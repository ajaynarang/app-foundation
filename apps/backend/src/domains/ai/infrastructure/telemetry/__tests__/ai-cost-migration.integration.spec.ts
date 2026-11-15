import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { PrismaClient } from '@appshore/db';
import { PrismaPg } from '@prisma/adapter-pg';

import { generateUuidV7 } from '@appshore/kernel/shared/utils/uuidv7';

/**
 * Migration `ai_cost_cache_write_and_payer` on a real Postgres:
 * - the budget-notes backfill stamps `plan:DEFAULT` only on rows nobody chose (null notes, every cap at the schema
 *   default), and leaves an admin-edited null-notes row, and any row with a note, alone;
 * - the spend views split `platform_cost_usd` out of `total_cost_usd` by the platform-paid rule.
 *
 * The backfill runs again inside a transaction that is rolled back, so nothing it touches is kept. Needs a database
 * with the migration applied; skipped when DATABASE_URL is unset or names no usable database.
 */
// No default: the spec writes rows, so it runs only against a database someone named.
const DATABASE_URL = process.env.DATABASE_URL;
const TENANT_KEYS = ['ws_ai_cost_mig_a', 'ws_ai_cost_mig_b', 'ws_ai_cost_mig_c', 'ws_ai_cost_mig_d'];
const MIGRATION = join(
  __dirname,
  '../../../../../../../../packages/appshore/db/prisma/migrations/20261112230000_ai_cost_cache_write_and_payer/migration.sql',
);
const NO_DATABASE_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', '3D000', '28P01', '42P01']);

function isNoDatabase(err: unknown): boolean {
  const code = (err as { code?: string }).code;
  return code !== undefined && (NO_DATABASE_CODES.has(code) || code.startsWith('P10'));
}

/** The migration's backfill statement, exactly as shipped. */
function backfillStatement(): string {
  const sql = readFileSync(MIGRATION, 'utf8');
  const start = sql.indexOf('UPDATE "tenant_ai_budgets"');
  if (start < 0) throw new Error('backfill statement not found in the migration');
  return sql.slice(start, sql.indexOf(';', start) + 1);
}

describe('migration ai_cost_cache_write_and_payer (integration)', () => {
  let pool: pg.Pool;
  let prisma: PrismaClient;
  let usable = false;
  const tenantIds: number[] = [];

  beforeAll(async () => {
    if (!DATABASE_URL) {
      console.warn('ai-cost-migration.integration: DATABASE_URL is unset — skipping');
      return;
    }
    try {
      pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
      prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
      await prisma.tenant.deleteMany({ where: { tenantId: { in: TENANT_KEYS } } });
      for (const key of TENANT_KEYS) {
        tenantIds.push((await prisma.tenant.create({ data: { tenantId: key, companyName: key } })).id);
      }
      usable = true;
    } catch (err) {
      if (!isNoDatabase(err)) throw err;
      console.warn(`ai-cost-migration.integration: no usable database (${(err as Error).message}) — skipping`);
    }
  }, 30_000);

  afterAll(async () => {
    if (usable) await prisma.tenant.deleteMany({ where: { tenantId: { in: TENANT_KEYS } } });
    await prisma?.$disconnect();
    await pool?.end();
  });

  /** Run `body` in a transaction that is always rolled back. */
  async function inRolledBackTransaction(body: (client: pg.PoolClient) => Promise<void>): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await body(client);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  }

  it('stamps plan:DEFAULT on untouched default rows only', async () => {
    if (!usable) return;
    const [untouched, edited, noted, partlyEdited] = tenantIds;
    await inRolledBackTransaction(async (client) => {
      const insert = (tenantId: number, caps: [number, number, number, number], notes: string | null) =>
        client.query(
          `INSERT INTO tenant_ai_budgets (tenant_id, daily_soft_usd, daily_hard_usd, monthly_soft_usd, monthly_hard_usd, notes, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, now())`,
          [tenantId, ...caps, notes],
        );
      await insert(untouched, [5, 20, 50, 200], null);
      await insert(edited, [5, 20, 50, 900], null);
      await insert(noted, [5, 20, 50, 200], 'kept at defaults on purpose');
      await insert(partlyEdited, [1, 20, 50, 200], null);

      await client.query(backfillStatement());

      const { rows } = await client.query<{ tenant_id: number; notes: string | null }>(
        'SELECT tenant_id, notes FROM tenant_ai_budgets WHERE tenant_id = ANY($1::int[]) ORDER BY tenant_id',
        [tenantIds],
      );
      const notes = new Map(rows.map((row) => [row.tenant_id, row.notes]));
      expect(notes.get(untouched)).toBe('plan:DEFAULT');
      expect(notes.get(edited)).toBeNull();
      expect(notes.get(noted)).toBe('kept at defaults on purpose');
      expect(notes.get(partlyEdited)).toBeNull();
    });
  });

  it('splits platform-paid cost out of the total in the spend views', async () => {
    if (!usable) return;
    const [tenantId] = tenantIds;
    await inRolledBackTransaction(async (client) => {
      const spend = (credentialType: string | null, cost: string) =>
        client.query(
          `INSERT INTO ai_invocations (id, tenant_id, surface, model, provider, status, cost_usd, credential_type)
           VALUES ($1, $2, 'CHAT', 'm', 'p', 'OK', $3, $4)`,
          [generateUuidV7(), tenantId, cost, credentialType],
        );
      await spend(null, '1.000000');
      await spend('PLATFORM_OPENROUTER', '2.000000');
      await spend('ANTHROPIC_KEY', '40.000000');

      const perTenant = await client.query<{ total_cost_usd: string; platform_cost_usd: string }>(
        'SELECT total_cost_usd::text, platform_cost_usd::text FROM vw_ai_cost_per_tenant WHERE tenant_id = $1',
        [tenantId],
      );
      expect(perTenant.rows).toEqual([{ total_cost_usd: '43.000000', platform_cost_usd: '3.000000' }]);

      const daily = await client.query<{ platform_cost_usd: string }>(
        'SELECT SUM(platform_cost_usd)::text AS platform_cost_usd FROM vw_ai_cost_daily WHERE tenant_id = $1',
        [tenantId],
      );
      expect(daily.rows[0].platform_cost_usd).toBe('3.000000');
    });
  });
});
