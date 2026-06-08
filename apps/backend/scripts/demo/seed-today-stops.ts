/**
 * SALLY Demo Data — Today-dated Stops for the Tower ribbon
 *
 * DEV / DEMO ONLY. The Tower v3 driver-card "ribbon" is a 24-hour (00→24)
 * timeline that draws pickup/delivery glyphs and drive/deadhead segments from
 * each stop's `appointmentDate` + `earliestArrival`/`latestArrival`. After a
 * `setup:demo` run the demo tenant's loads are dated across a 60-day window,
 * so almost no stop falls on *today* — the ribbon renders nearly empty and the
 * feature can't be demoed.
 *
 * This script re-dates a handful of the demo tenant's currently-active loads
 * (IN_TRANSIT / ASSIGNED) so their stops land on TODAY with spread-out times,
 * giving every driver lane a populated ribbon.
 *
 * Idempotent: it always re-dates the same active loads to *today*, so running
 * it again the next day simply refreshes them. Tenant-scoped to the demo
 * tenant only — it never touches another tenant's data and refuses to run
 * against a production database.
 *
 * Usage:
 *   pnpm --filter @app/backend demo:today-stops             # re-date demo loads
 *   pnpm --filter @app/backend demo:today-stops -- --dry-run # preview only
 */
import dotenv from 'dotenv';
import path from 'path';

// Load .env and .env.local — same pattern as scripts/demo/index.ts.
const backendRoot = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(backendRoot, '.env') });
dotenv.config({ path: path.join(backendRoot, '.env.local'), override: true });

import { PrismaClient, LoadStatus, LoadStopStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

import { DEMO_TENANT_ID, DEMO_TENANT_NAME } from './config';
import { createLogger } from './helpers/logger';

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

/**
 * How many active loads to re-date onto today. Six gives the spine a healthy
 * mix of populated lanes without re-dating the entire fleet.
 */
const MAX_LOADS = 6;

/**
 * Pickup / delivery time windows, one pair per re-dated load. Times are
 * staggered across the working day so the ribbon shows glyphs and drive
 * segments fanned out from morning to evening rather than stacked at one tick.
 * `earliest`/`latest` are "HH:MM" strings — exactly the shape the
 * `LoadStop.earliestArrival` / `latestArrival` VarChar columns and
 * `ActiveLoadsService.composeAppointmentAt()` expect.
 */
const STOP_WINDOWS: ReadonlyArray<{
  pickup: { earliest: string; latest: string };
  delivery: { earliest: string; latest: string };
}> = [
  { pickup: { earliest: '06:00', latest: '07:30' }, delivery: { earliest: '11:00', latest: '12:30' } },
  { pickup: { earliest: '07:30', latest: '09:00' }, delivery: { earliest: '13:00', latest: '14:30' } },
  { pickup: { earliest: '09:00', latest: '10:30' }, delivery: { earliest: '15:00', latest: '16:30' } },
  { pickup: { earliest: '10:30', latest: '12:00' }, delivery: { earliest: '17:00', latest: '18:30' } },
  { pickup: { earliest: '12:00', latest: '13:30' }, delivery: { earliest: '19:00', latest: '20:30' } },
  { pickup: { earliest: '13:30', latest: '15:00' }, delivery: { earliest: '20:30', latest: '22:00' } },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CliArgs {
  dryRun: boolean;
}

function parseArgs(): CliArgs {
  return { dryRun: process.argv.slice(2).includes('--dry-run') };
}

/** Midnight today, in local time — the value for `appointmentDate` (@db.Date). */
function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { dryRun } = parseArgs();
  const logger = createLogger();
  logger.header(DEMO_TENANT_NAME, dryRun ? 'TODAY STOPS (dry-run)' : 'TODAY STOPS');

  const connectionString = process.env.DATABASE_URL || 'postgresql://sally_user:sally_password@localhost:5432/sally';
  const pool = new pg.Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    // Guard — this re-dates demo data; never let it run against production.
    if (process.env.NODE_ENV === 'production') {
      logger.error('Refusing to run: NODE_ENV=production. This is a DEV/DEMO-only script.');
      process.exit(1);
    }

    const tenant = await prisma.tenant.findUnique({ where: { tenantId: DEMO_TENANT_ID } });
    if (!tenant) {
      logger.error(`Demo tenant "${DEMO_TENANT_ID}" not found — run pnpm setup:demo first.`);
      process.exit(1);
    }

    // Pick the demo tenant's active loads — IN_TRANSIT first (rolling now),
    // then ASSIGNED (about to roll). Only loads with a driver headline a lane.
    const loads = await prisma.load.findMany({
      where: {
        tenantId: tenant.id,
        isActive: true,
        driverId: { not: null },
        status: { in: [LoadStatus.IN_TRANSIT, LoadStatus.ASSIGNED] },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: MAX_LOADS,
      include: {
        stops: { orderBy: { sequenceOrder: 'asc' } },
      },
    });

    if (loads.length === 0) {
      logger.warn('No active (IN_TRANSIT / ASSIGNED) demo loads found — nothing to re-date.');
      logger.warn('Run pnpm setup:demo to generate demo loads first.');
      return;
    }

    const today = startOfToday();
    let loadsTouched = 0;
    let stopsTouched = 0;

    for (let i = 0; i < loads.length; i++) {
      const load = loads[i];
      const window = STOP_WINDOWS[i % STOP_WINDOWS.length];

      // First pickup-type stop and last delivery-type stop drive the ribbon's
      // current → next pair. A re-date that leaves either undated would leave
      // the lane half-empty, so skip a load that has no pickup or no delivery.
      const pickup = load.stops.find((s) => s.actionType !== 'delivery');
      const delivery = [...load.stops].reverse().find((s) => s.actionType === 'delivery');
      if (!pickup || !delivery) {
        logger.item(load.loadNumber, 'skipped — missing pickup or delivery stop', 'skip');
        continue;
      }

      // IN_TRANSIT → pickup already done (driver is rolling); ASSIGNED →
      // pickup still pending (driver is heading to it). Matching the stop
      // status to the load status keeps ActiveLoadsService's current/next
      // stop picker consistent with the seeded timeline.
      const rolling = load.status === LoadStatus.IN_TRANSIT;
      const pickupStatus = rolling ? LoadStopStatus.COMPLETED : LoadStopStatus.PENDING;

      const pickupSummary = `pickup ${window.pickup.earliest}-${window.pickup.latest}`;
      const deliverySummary = `delivery ${window.delivery.earliest}-${window.delivery.latest}`;
      logger.item(load.loadNumber, `${load.status} · ${pickupSummary} · ${deliverySummary}`, 'create');

      if (dryRun) {
        loadsTouched++;
        stopsTouched += 2;
        continue;
      }

      await prisma.$transaction([
        prisma.loadStop.update({
          where: { id: pickup.id },
          data: {
            appointmentDate: today,
            earliestArrival: window.pickup.earliest,
            latestArrival: window.pickup.latest,
            status: pickupStatus,
          },
        }),
        prisma.loadStop.update({
          where: { id: delivery.id },
          data: {
            appointmentDate: today,
            earliestArrival: window.delivery.earliest,
            latestArrival: window.delivery.latest,
            status: LoadStopStatus.PENDING,
          },
        }),
        // Keep `Load.pickupDate` consistent so the ASSIGNED-load lookahead
        // window in ActiveLoadsService still admits the re-dated load.
        prisma.load.update({ where: { id: load.id }, data: { pickupDate: today } }),
      ]);

      loadsTouched++;
      stopsTouched += 2;
    }

    logger.info(
      dryRun
        ? `Dry-run: would re-date ${loadsTouched} load(s) / ${stopsTouched} stop(s) onto today.`
        : `Re-dated ${loadsTouched} load(s) / ${stopsTouched} stop(s) onto today — Tower ribbon will now populate.`,
    );
  } catch (err) {
    logger.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();
