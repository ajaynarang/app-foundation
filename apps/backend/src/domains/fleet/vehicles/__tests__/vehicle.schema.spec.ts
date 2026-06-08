import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

describe('Vehicle Schema', () => {
  let prisma: PrismaClient;
  let pool: pg.Pool;
  let testTenantId: number;
  const createdVehicleIds: number[] = [];

  beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL || 'postgresql://sally_user:sally_password@localhost:5432/sally';
    pool = new pg.Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    prisma = new PrismaClient({ adapter });

    await prisma.$connect();

    // Create a test tenant or use existing one
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) {
      throw new Error('No tenant found for testing');
    }
    testTenantId = tenant.id;
  });

  afterAll(async () => {
    // Clean up created vehicles
    if (createdVehicleIds.length > 0) {
      await prisma.vehicle.deleteMany({
        where: {
          id: {
            in: createdVehicleIds,
          },
        },
      });
    }
    await prisma.$disconnect();
    await pool.end();
  });

  it('should store TMS vehicle fields', async () => {
    const vehicle = await prisma.vehicle.create({
      data: {
        vehicleId: `VEH-TEST-${Date.now()}`,
        unitNumber: 'UNIT-001',
        fuelCapacityGallons: 150,
        equipmentType: 'DRY_VAN',
        tenantId: testTenantId,
        make: 'FREIGHTLINER',
        model: 'CASCADIA',
        year: 2018,
        vin: '1FUJGHDV9JLJY8062',
        licensePlate: 'TX R70-1836',
      },
    });
    createdVehicleIds.push(vehicle.id);

    expect(vehicle.make).toBe('FREIGHTLINER');
    expect(vehicle.model).toBe('CASCADIA');
    expect(vehicle.year).toBe(2018);
    expect(vehicle.vin).toBe('1FUJGHDV9JLJY8062');
    expect(vehicle.licensePlate).toBe('TX R70-1836');
  });

  it('should store ELD telematics metadata in JSONB', async () => {
    const vehicle = await prisma.vehicle.create({
      data: {
        vehicleId: `VEH-TEST-${Date.now()}`,
        unitNumber: 'UNIT-002',
        fuelCapacityGallons: 150,
        equipmentType: 'DRY_VAN',
        tenantId: testTenantId,
        vin: '3AKJHPDV2KSKA4482',
        eldTelematicsMetadata: {
          eldVendor: 'SAMSARA_ELD',
          eldId: '281474996387575',
          serial: 'G9NP7UVUFS',
          gateway: {
            serial: 'G9NP-7UV-UFS',
            model: 'VG55NA',
          },
          esn: '471928S0565797',
          lastSyncAt: new Date().toISOString(),
        },
      },
    });
    createdVehicleIds.push(vehicle.id);

    expect(vehicle.eldTelematicsMetadata).toHaveProperty('eldVendor', 'SAMSARA_ELD');
    expect(vehicle.eldTelematicsMetadata).toHaveProperty('eldId');
    expect(vehicle.eldTelematicsMetadata).toHaveProperty('serial');
  });
});
