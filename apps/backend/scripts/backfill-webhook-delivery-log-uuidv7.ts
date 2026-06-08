/**
 * Phase 2 Task 13b — WebhookDeliveryLog id (CUID) → UUIDv7 backfill.
 * Idempotent: only updates rows where id_v7 IS NULL. Write-hot path; volume
 * on staging-debug is 0 rows so the single-pass shape suffices. If production
 * row count > 10M, see the plan for the chunked-backfill template.
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
        FROM webhook_delivery_logs
       WHERE id_v7 IS NULL
       ORDER BY created_at ASC
    `;
    console.log(`Backfilling ${rows.length} webhook_delivery_logs rows...`);

    for (const r of rows) {
      const v7 = uuidv7FromTimestamp(r.created_at);
      await prisma.$executeRaw`
        UPDATE webhook_delivery_logs
           SET id_v7 = ${v7}::uuid
         WHERE id = ${r.id}
      `;
    }

    const nulls = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM webhook_delivery_logs WHERE id_v7 IS NULL
    `;
    if (nulls[0].count > 0n) {
      throw new Error(`Backfill incomplete: ${nulls[0].count} rows still NULL`);
    }
    console.log('Backfill complete. id_v7 populated for every webhook_delivery_logs row.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
