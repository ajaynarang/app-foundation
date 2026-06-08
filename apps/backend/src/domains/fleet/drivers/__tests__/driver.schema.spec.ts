import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

describe('Driver Schema', () => {
  let prisma: PrismaClient;
  let pool: pg.Pool;
  let testTenantId: number;
  const createdDriverIds: number[] = [];

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
    // Clean up created drivers
    if (createdDriverIds.length > 0) {
      await prisma.driver.deleteMany({
        where: {
          id: {
            in: createdDriverIds,
          },
        },
      });
    }
    await prisma.$disconnect();
    await pool.end();
  });

  it('should store TMS driver fields', async () => {
    const driver = await prisma.driver.create({
      data: {
        driverId: `DRV-TEST-${Date.now()}`,
        name: 'John Smith',
        tenantId: testTenantId,
        phone: '+19788856169',
        licenseNumber: 'NHL14227039',
        licenseState: 'NH',
      },
    });
    createdDriverIds.push(driver.id);

    expect(driver.licenseState).toBe('NH');
  });

  it('should store ELD metadata in JSONB', async () => {
    const driver = await prisma.driver.create({
      data: {
        driverId: `DRV-TEST-${Date.now()}-2`,
        name: 'Oscar Toribo',
        tenantId: testTenantId,
        phone: '+19788856169',
        eldMetadata: {
          eldVendor: 'SAMSARA_ELD',
          eldId: '53207939',
          username: 'Oscar',
          eldSettings: {
            rulesets: [
              {
                cycle: 'USA 70 hour / 8 day',
                shift: 'US Interstate Property',
                restart: '34-hour Restart',
                break: 'Property (off-duty/sleeper)',
              },
            ],
          },
          timezone: 'America/New_York',
          lastSyncAt: new Date().toISOString(),
        },
      },
    });
    createdDriverIds.push(driver.id);

    expect(driver.eldMetadata).toHaveProperty('eldVendor', 'SAMSARA_ELD');
    expect(driver.eldMetadata).toHaveProperty('eldSettings');
  });
});
