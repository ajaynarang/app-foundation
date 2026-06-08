/**
 * Phase 2 Task 5 — DeskEpisodeStep UUIDv4 → UUIDv7 backfill.
 *
 * Run AFTER migration `20260505190000_desk_episode_step_id_v7_add` has applied
 * (it adds the nullable `id_v7 UUID` column). This script derives a
 * deterministic UUIDv7 from each row's `started_at` and writes it to `id_v7`,
 * preserving the existing chronological sort order under the new PK.
 *
 * Run BEFORE migration `20260505190001_desk_episode_step_id_v7_promote`
 * (which assumes id_v7 is fully populated and SETs NOT NULL on the inbound
 * FK column before swapping the PK).
 *
 * Usage:
 *   doppler run -- pnpm tsx apps/backend/scripts/backfill-desk-episode-step-uuidv7.ts
 *
 * Idempotent: only updates rows where id_v7 IS NULL.
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
    const rows = await prisma.$queryRaw<Array<{ id: string; started_at: Date }>>`
      SELECT id, started_at
        FROM desk_episode_steps
       WHERE id_v7 IS NULL
       ORDER BY started_at ASC
    `;
    console.log(`Backfilling ${rows.length} desk_episode_steps rows...`);

    for (const r of rows) {
      const v7 = uuidv7FromTimestamp(r.started_at);
      await prisma.$executeRaw`
        UPDATE desk_episode_steps
           SET id_v7 = ${v7}::uuid
         WHERE id = ${r.id}::uuid
      `;
    }

    const nulls = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM desk_episode_steps WHERE id_v7 IS NULL
    `;
    if (nulls[0].count > 0n) {
      throw new Error(`Backfill incomplete: ${nulls[0].count} rows still NULL`);
    }
    console.log('Backfill complete. id_v7 populated for every desk_episode_steps row.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
