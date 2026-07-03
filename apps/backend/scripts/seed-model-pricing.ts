/**
 * Standalone runner for the model_pricing seed.
 *
 * Usage:
 *   pnpm run seed:model-pricing
 *
 * The full base seed list (`pnpm run setup:base`) already includes
 * `08-model-pricing`. This script exists so we can refresh pricing rows in
 * isolation when provider rates change, without re-running every other seed.
 *
 * Idempotent — re-runs without changes are no-ops.
 */
import * as dotenv from 'dotenv';
import pg from 'pg';
import { PrismaClient } from '@appshore/db';
import { PrismaPg } from '@prisma/adapter-pg';

import { seed } from '../../../packages/foundation/db/prisma/seeds/08-model-pricing.seed';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL || 'postgresql://app_user:app_password@localhost:5432/app';
  const pool = new pg.Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const result = await seed.run(prisma);
    // eslint-disable-next-line no-console
    console.log(`[${seed.name}] created=${result.created} skipped=${result.skipped}`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('seed-model-pricing failed:', error);
  process.exit(1);
});
