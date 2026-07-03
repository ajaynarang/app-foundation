/**
 * Phase 2 Task 8 — AgentInvocationLog id (UUIDv4) → UUIDv7 backfill.
 *
 * Run AFTER migration `20260505190006_agent_invocation_log_id_v7_add` has
 * applied (it adds the nullable `id_v7 UUID` column). This script derives a
 * deterministic UUIDv7 from each row's `created_at` and writes it to `id_v7`,
 * preserving the existing chronological sort order under the new PK.
 *
 * Run BEFORE migration `20260505190007_agent_invocation_log_id_v7_promote`
 * (which assumes id_v7 is fully populated before swapping the PK).
 *
 * Usage:
 *   doppler run -- pnpm tsx apps/backend/scripts/backfill-agent-invocation-log-uuidv7.ts
 *
 * Idempotent: only updates rows where id_v7 IS NULL.
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
        FROM agent_invocation_logs
       WHERE id_v7 IS NULL
       ORDER BY created_at ASC
    `;
    console.log(`Backfilling ${rows.length} agent_invocation_logs rows...`);

    for (const r of rows) {
      const v7 = uuidv7FromTimestamp(r.created_at);
      await prisma.$executeRaw`
        UPDATE agent_invocation_logs
           SET id_v7 = ${v7}::uuid
         WHERE id = ${r.id}::uuid
      `;
    }

    const nulls = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM agent_invocation_logs WHERE id_v7 IS NULL
    `;
    if (nulls[0].count > 0n) {
      throw new Error(`Backfill incomplete: ${nulls[0].count} rows still NULL`);
    }
    console.log('Backfill complete. id_v7 populated for every agent_invocation_logs row.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
