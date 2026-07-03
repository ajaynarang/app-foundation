/**
 * Phase 2 Task 13b — DomainEventLog id (CUID) → UUIDv7 backfill.
 * Idempotent: only updates rows where id_v7 IS NULL. Write-hot path; volume
 * on staging-debug is 42,438 rows — below the plan's 10M-row chunked-backfill
 * threshold. The single-pass UPDATE-per-row shape completes in well under a
 * minute on this volume. If production row count > 10M, switch to the
 * chunked-backfill template from the plan.
 */
import 'dotenv/config';
import { PrismaClient } from '@appshore/db';
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
        FROM domain_event_log
       WHERE id_v7 IS NULL
       ORDER BY created_at ASC
    `;
    console.log(`Backfilling ${rows.length} domain_event_log rows...`);

    let processed = 0;
    const progressEvery = 5000;
    for (const r of rows) {
      const v7 = uuidv7FromTimestamp(r.created_at);
      await prisma.$executeRaw`
        UPDATE domain_event_log
           SET id_v7 = ${v7}::uuid
         WHERE id = ${r.id}
      `;
      processed++;
      if (processed % progressEvery === 0) {
        console.log(`  ${processed} / ${rows.length} backfilled`);
      }
    }

    const nulls = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM domain_event_log WHERE id_v7 IS NULL
    `;
    if (nulls[0].count > 0n) {
      throw new Error(`Backfill incomplete: ${nulls[0].count} rows still NULL`);
    }
    console.log('Backfill complete. id_v7 populated for every domain_event_log row.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
