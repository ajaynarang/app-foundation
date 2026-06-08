/**
 * fix-driver-vehicle-links.ts
 *
 * Fixes bidirectional driver-vehicle links.
 * ELD sync sets Vehicle.assignedDriverId but not Driver.assignedVehicleId.
 * This script syncs the reverse direction.
 *
 * Usage: doppler run -- npx ts-node scripts/fix-driver-vehicle-links.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const vehicles = await prisma.vehicle.findMany({
    where: { assignedDriverId: { not: null }, lifecycleStatus: 'ACTIVE' },
    select: { id: true, unitNumber: true, assignedDriverId: true, tenantId: true },
  });

  let fixed = 0;
  for (const v of vehicles) {
    const driver = await prisma.driver.findUnique({
      where: { id: v.assignedDriverId! },
      select: { id: true, name: true, assignedVehicleId: true },
    });
    if (driver && !driver.assignedVehicleId) {
      await prisma.driver.update({
        where: { id: driver.id },
        data: { assignedVehicleId: v.id },
      });
      fixed++;
      console.log(`  ✓ ${driver.name} → ${v.unitNumber}`);
    }
  }

  console.log(`\nFixed ${fixed} driver-vehicle links`);
  await prisma.$disconnect();
  pool.end();
}

main().catch(console.error);
