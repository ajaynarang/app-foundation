import { PrismaClient } from '../../generated/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as dotenv from 'dotenv';
import { detectEnvironment, checkSafety, logSeedResult, logHeader, getDatabaseName } from './utils';

// Load environment variables
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

// ---------------------------------------------------------------------------
// Seeds — single list of platform reference data.
// ---------------------------------------------------------------------------

const SEED_LIST = [
  '00-implicit-tenant',
  '01-super-admin',
  '02-feature-flags',
  '03-plan-config',
  '04-plan-entitlements',
  '05-vendor-configs',
  '06-add-ons',
  '07-desk',
  '08-model-pricing',
];

// ---------------------------------------------------------------------------
// CLI Argument Parsing
// ---------------------------------------------------------------------------

function parseArgs(): { command: 'seed' | 'reset' | 'status' } {
  const args = process.argv.slice(2);

  if (args.includes('--status')) {
    return { command: 'status' };
  }

  if (args.includes('--reset')) {
    return { command: 'reset' };
  }

  return { command: 'seed' };
}

// ---------------------------------------------------------------------------
// Status Command
// ---------------------------------------------------------------------------

async function showStatus(prisma: PrismaClient): Promise<void> {
  const [superAdminCount, flagCount, flagsEnabled, tenantCount, notificationCount] = await Promise.all([
    prisma.user.count({ where: { role: 'SUPER_ADMIN' } }),
    prisma.featureFlag.count(),
    prisma.featureFlag.count({ where: { enabled: true } }),
    prisma.tenant.count(),
    prisma.notification.count(),
  ]);

  const flagsDisabled = flagCount - flagsEnabled;

  console.log('');
  console.log('  Platform Setup Status');
  console.log(`  Database: ${getDatabaseName()}`);
  console.log('');
  console.log('  Entity             Count    Status');
  console.log('  ─────────────────  ───────  ─────────────────────');
  console.log(
    `  Super Admin        ${String(superAdminCount).padEnd(7)}  ${superAdminCount > 0 ? 'seeded' : 'not seeded'}`,
  );
  console.log(
    `  Feature Flags      ${String(flagCount).padEnd(7)}  ${flagCount > 0 ? `${flagsEnabled} on, ${flagsDisabled} off` : 'not seeded'}`,
  );
  console.log(`  Tenants            ${String(tenantCount).padEnd(7)}  ${tenantCount > 0 ? 'present' : 'none'}`);
  console.log(
    `  Notifications      ${String(notificationCount).padEnd(7)}  ${notificationCount > 0 ? 'present' : 'none'}`,
  );
  console.log('');
}

// ---------------------------------------------------------------------------
// Run Seeds
// ---------------------------------------------------------------------------

async function runSeeds(prisma: PrismaClient): Promise<void> {
  console.log(`  Seeds to run: ${SEED_LIST.join(' → ')}`);
  console.log('');

  for (const seedName of SEED_LIST) {
    const module = await import(`./${seedName}.seed`);
    const seedDef = module.seed;

    try {
      const result = await seedDef.run(prisma);
      logSeedResult(seedDef.name, result);
    } catch (error: any) {
      console.error(`  [${seedDef.name}] FAILED: ${error.message}`);
      throw error;
    }
  }

  console.log('');
  console.log('  Setup complete.');
  console.log('');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { command } = parseArgs();
  const env = detectEnvironment();

  // Initialize Prisma
  const connectionString =
    process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5499/app?schema=public';
  const pool = new pg.Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    if (command === 'status') {
      await showStatus(prisma);
      return;
    }

    logHeader(command === 'reset' ? 'reset' : 'seed', env);

    const safetyCommand = command === 'reset' ? 'reset' : 'base';
    const allowed = await checkSafety(safetyCommand, env);
    if (!allowed) {
      console.log('  Aborted.\n');
      return;
    }

    if (command === 'reset') {
      console.log('  Resetting database...');
    }

    await runSeeds(prisma);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('\n  Setup failed:', error.message);
  process.exit(1);
});
