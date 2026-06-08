/**
 * SALLY Demo Data Engine — CLI Orchestrator
 *
 * Usage:
 *   pnpm run setup:demo                    # Full seed (stages 0-4)
 *   pnpm run setup:demo -- --stage=0       # Run single stage
 *   pnpm run setup:demo:reset              # Clean & re-seed
 */
import dotenv from 'dotenv';
import path from 'path';

// Load .env and .env.local (same pattern as Prisma seeds)
const backendRoot = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(backendRoot, '.env') });
dotenv.config({ path: path.join(backendRoot, '.env.local'), override: true });
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

import { DEMO_TENANT_ID, DEMO_TENANT_NAME, DEMO_PASSWORD, DEMO_USERS } from './config';
import { createLogger, DemoLogger } from './helpers/logger';

// ---------------------------------------------------------------------------
// CLI Argument Parsing
// ---------------------------------------------------------------------------

interface CliArgs {
  stage: number | null;
  reset: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let stage: number | null = null;
  let reset = false;

  for (const arg of args) {
    if (arg.startsWith('--stage=')) {
      stage = parseInt(arg.split('=')[1], 10);
      if (isNaN(stage) || stage < 0 || stage > 4) {
        console.error('Error: --stage must be 0-4');
        process.exit(1);
      }
    }
    if (arg === '--reset') {
      reset = true;
    }
  }

  return { stage, reset };
}

// ---------------------------------------------------------------------------
// Pre-flight Checks
// ---------------------------------------------------------------------------

async function preflight(prisma: PrismaClient, logger: DemoLogger): Promise<boolean> {
  let allPassed = true;

  // 1. DB connection
  try {
    await prisma.$queryRaw`SELECT 1`;
    logger.preflightPass('Database connection', 'OK');
  } catch {
    logger.preflightFail('Database connection', 'Cannot connect to PostgreSQL');
    return false;
  }

  // 2. Base seed data (feature flags)
  const featureFlagCount = await prisma.featureFlag.count();
  if (featureFlagCount > 0) {
    logger.preflightPass('Feature flags', `${featureFlagCount} found`);
  } else {
    logger.preflightFail('Feature flags', 'None found — run pnpm setup:base first');
    allPassed = false;
  }

  // 3. Firebase config
  const hasFirebase = !!(
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    (process.env.FIREBASE_PRIVATE_KEY || process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
  );
  if (hasFirebase) {
    logger.preflightPass('Firebase config', 'Credentials found');
  } else {
    logger.warn('Firebase not configured — users will be created without Firebase auth');
  }

  return allPassed;
}

// ---------------------------------------------------------------------------
// Stage Definitions
// ---------------------------------------------------------------------------

interface StageDefinition {
  name: string;
  fn: (prisma: PrismaClient, logger: DemoLogger) => Promise<void>;
}

function getStages(): StageDefinition[] {
  return [
    {
      name: 'Stage 0: Tenant & Users',
      fn: async (prisma, logger) => {
        const mod = await import('./stage-0-tenant');
        await mod.run(prisma, logger);
      },
    },
    {
      name: 'Stage 1: Fleet & Customers',
      fn: async (prisma, logger) => {
        const mod = await import('./stage-1-fleet');
        await mod.run(prisma, logger);
      },
    },
    {
      name: 'Stage 2: Load Generation',
      fn: async (prisma, logger) => {
        const mod = await import('./stage-2-loads');
        await mod.run(prisma, logger);
      },
    },
    {
      name: 'Stage 3: Financials',
      fn: async (prisma, logger) => {
        const mod = await import('./stage-3-financials');
        await mod.run(prisma, logger);
      },
    },
    {
      name: 'Stage 4: Operations',
      fn: async (prisma, logger) => {
        const mod = await import('./stage-4-operations');
        await mod.run(prisma, logger);
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { stage, reset } = parseArgs();
  const logger = createLogger();

  const mode = reset ? 'RESET + SEED' : stage !== null ? `STAGE ${stage} ONLY` : 'FULL SEED';
  logger.header(DEMO_TENANT_NAME, mode);

  // Connect
  const connectionString = process.env.DATABASE_URL || 'postgresql://sally_user:sally_password@localhost:5432/sally';
  const pool = new pg.Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const startTime = Date.now();

  try {
    // Pre-flight
    logger.info('Running pre-flight checks...');
    const passed = await preflight(prisma, logger);
    if (!passed) {
      logger.error('Pre-flight checks failed. Aborting.');
      process.exit(1);
    }
    console.log('');

    // Reset if requested
    if (reset) {
      logger.stageStart('Reset: Cleaning demo data...');
      const resetStart = Date.now();
      const mod = await import('./stage-0-tenant');
      await mod.resetDemoData(prisma, logger);
      logger.stageEnd('Reset complete', Date.now() - resetStart);
    }

    // Determine which stages to run
    const allStages = getStages();
    const stagesToRun = stage !== null ? [allStages[stage]].filter(Boolean) : allStages;

    if (stage !== null && !allStages[stage]) {
      logger.error(`Stage ${stage} not implemented yet.`);
      process.exit(1);
    }

    // Run stages
    const stats: Record<string, number> = {};
    for (let i = 0; i < stagesToRun.length; i++) {
      const s = stagesToRun[i];
      const stageStart = Date.now();
      logger.stageStart(s.name);
      try {
        await s.fn(prisma, logger);
        logger.stageEnd(s.name, Date.now() - stageStart);
      } catch (err) {
        logger.stageFail(s.name, err);
        const stageIdx = stage !== null ? stage : i;
        logger.error(`To resume from this stage, run: pnpm run setup:demo:new -- --stage=${stageIdx}`);
        throw err;
      }
    }

    // Summary — query actual counts from the DB
    const demoTenant = await prisma.tenant.findUnique({ where: { tenantId: DEMO_TENANT_ID } });
    if (demoTenant) {
      const tid = demoTenant.id;
      const [loads, invoices, settlements, alerts, drivers, vehicles, customers] = await Promise.all([
        prisma.load.count({ where: { tenantId: tid } }),
        prisma.invoice.count({ where: { tenantId: tid } }),
        prisma.settlement.count({ where: { tenantId: tid } }),
        prisma.alert.count({ where: { tenantId: tid } }),
        prisma.driver.count({ where: { tenantId: tid } }),
        prisma.vehicle.count({ where: { tenantId: tid } }),
        prisma.customer.count({ where: { tenantId: tid } }),
      ]);
      stats['Drivers'] = drivers;
      stats['Vehicles'] = vehicles;
      stats['Customers'] = customers;
      stats['Loads'] = loads;
      stats['Invoices'] = invoices;
      stats['Settlements'] = settlements;
      stats['Alerts'] = alerts;
    }

    const loginEmail = DEMO_USERS[0].email;
    logger.summary(stats, loginEmail, DEMO_PASSWORD, Date.now() - startTime);
  } catch (err) {
    if (err instanceof Error) {
      logger.error(err.message);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();
