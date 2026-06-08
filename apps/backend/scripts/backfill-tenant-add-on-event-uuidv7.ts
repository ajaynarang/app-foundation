/**
 * Phase 2 Task 13b — TenantAddOnEvent id (CUID) → UUIDv7 backfill.
 * Idempotent: only updates rows where id_v7 IS NULL. See Task 13a/13b plan
 * + the parallel backfill script for tenant_plan_events for the full pattern.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { uuidv7FromTimestamp } from '../src/shared/utils/uuidv7';

async function main(): Promise<void> {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  try {
    const rows = await prisma.$queryRaw<Array<{ id: string; created_at: Date }>>`
      SELECT id, created_at
        FROM tenant_add_on_events
       WHERE id_v7 IS NULL
       ORDER BY created_at ASC
    `;
    console.log(`Backfilling ${rows.length} tenant_add_on_events rows...`);

    for (const r of rows) {
      const v7 = uuidv7FromTimestamp(r.created_at);
      await prisma.$executeRaw`
        UPDATE tenant_add_on_events
           SET id_v7 = ${v7}::uuid
         WHERE id = ${r.id}
      `;
    }

    const nulls = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM tenant_add_on_events WHERE id_v7 IS NULL
    `;
    if (nulls[0].count > 0n) {
      throw new Error(`Backfill incomplete: ${nulls[0].count} rows still NULL`);
    }
    console.log('Backfill complete. id_v7 populated for every tenant_add_on_events row.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
