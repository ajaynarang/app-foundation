/**
 * Dev/staging cleanup for the legacy "Unknown Facility" placeholder stops (SQ-112).
 *
 * NEVER run against production. The placeholder name was an invented value that
 * collided across cities; this repairs the data:
 *   - Stop rows with zero references (LoadStop / RouteSegment / RecurringLaneStop)
 *     are deleted outright (dev junk).
 *   - Referenced rows keep their references but have the placeholder name nulled
 *     to '' so they no longer read as a real facility. Locations are NOT rewritten
 *     (we don't guess), so a previously-merged-wrong stop still needs the source
 *     ratecon to fully repair — surfaced in the summary.
 *
 * Run: doppler run --project sally-backend --config dev -- npx tsx scripts/cleanup-unknown-facility-stops.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const PLACEHOLDER = 'Unknown Facility';

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set — run via `doppler run -- ...`');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  try {
    const placeholders = await prisma.stop.findMany({
      where: { name: PLACEHOLDER },
      select: { id: true },
    });

    let deleted = 0;
    let renamed = 0;
    const keptWithRefs: number[] = [];

    for (const { id } of placeholders) {
      const [loadStops, routeSegments, laneStops] = await Promise.all([
        prisma.loadStop.count({ where: { stopId: id } }),
        prisma.routeSegment.count({ where: { stopId: id } }),
        prisma.recurringLaneStop.count({ where: { stopId: id } }),
      ]);
      const refs = loadStops + routeSegments + laneStops;

      if (refs === 0) {
        await prisma.stop.delete({ where: { id } });
        deleted++;
      } else {
        // Schema keeps Stop.name non-null; '' reads as "no facility" in the UI
        // and can no longer collide on any name-based lookup (removed anyway).
        await prisma.stop.update({ where: { id }, data: { name: '' } });
        renamed++;
        keptWithRefs.push(id);
      }
    }

    console.log(
      `Unknown Facility cleanup complete: ${placeholders.length} found — ` +
        `${deleted} deleted (zero refs), ${renamed} renamed to '' (kept refs).`,
    );
    if (keptWithRefs.length > 0) {
      console.log(
        `Stops still referenced (verify their locations against source ratecons): ${keptWithRefs.join(', ')}`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
