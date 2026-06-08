import { Test, TestingModule } from '@nestjs/testing';
import { SearchService } from '../search.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { createMockPrisma } from '../../../../test/mocks';

describe('SearchService', () => {
  const TENANT = 7;
  let service: SearchService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [SearchService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get<SearchService>(SearchService);
  });

  describe('guard', () => {
    it('returns [] for queries under 2 characters without hitting the db', async () => {
      const result = await service.search(TENANT, 'A', 10);
      expect(result).toEqual([]);
      expect(prisma.load.findMany).not.toHaveBeenCalled();
    });

    it('passes the limit through to reference queries and a doubled cap to loads', async () => {
      await service.search(TENANT, 'test', 5);
      // Reference entities use the shared limit…
      expect(prisma.driver.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }));
      expect(prisma.customer.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }));
      // …loads get extra headroom (limit * 2) so recent ones aren't crowded out.
      expect(prisma.load.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 10 }));
    });

    it('orders loads newest-first so recent Draft/Pending surface over old history', async () => {
      await service.search(TENANT, 'test', 5);
      expect(prisma.load.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { createdAt: 'desc' } }));
    });

    it('caps the load headroom at MAX_LOAD_RESULTS for large requested limits', async () => {
      await service.search(TENANT, 'test', 50);
      // 50 * 2 = 100, clamped to the 20 ceiling.
      expect(prisma.load.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 20 }));
    });

    it('scopes every entity query to the tenant', async () => {
      await service.search(42, 'test', 10);
      for (const m of [
        'load',
        'driver',
        'invoice',
        'customer',
        'settlement',
        'vehicle',
        'trip',
        'trailer',
        'recurringLane',
      ] as const) {
        expect(prisma[m].findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: expect.objectContaining({ tenantId: 42 }) }),
        );
      }
    });
  });

  describe('loads', () => {
    it('matches by number, ref, customer, lane city and driver name; labels with load# (ref)', async () => {
      prisma.load.findMany.mockResolvedValue([
        {
          loadNumber: 'LD-2026-001',
          referenceNumber: 'PO-88421',
          customerName: 'Walmart',
          status: 'IN_TRANSIT',
          originCity: 'Chicago',
          originState: 'IL',
          destinationCity: 'Dallas',
          destinationState: 'TX',
        },
      ]);

      const load = (await service.search(TENANT, 'walmart', 10)).find((r) => r.type === 'load')!;
      expect(load.id).toBe('LD-2026-001');
      expect(load.label).toBe('LD-2026-001 · Ref: PO-88421');
      expect(load.description).toBe('Walmart · Chicago, IL → Dallas, TX · IN_TRANSIT');
      expect(load.referenceNumber).toBe('PO-88421');
      expect(load.href).toContain('/dispatcher/loads');

      const orFields = prisma.load.findMany.mock.calls[0][0].where.OR.map((c: any) => Object.keys(c)[0]);
      expect(orFields).toEqual(
        expect.arrayContaining([
          'loadNumber',
          'referenceNumber',
          'customerName',
          'originCity',
          'destinationCity',
          'driver',
        ]),
      );
    });

    it('labels a load without a reference using just the load number', async () => {
      prisma.load.findMany.mockResolvedValue([
        { loadNumber: 'LD-2026-022', referenceNumber: null, customerName: 'Costco', status: 'PENDING' },
      ]);
      const load = (await service.search(TENANT, 'costco', 10)).find((r) => r.type === 'load')!;
      expect(load.label).toBe('LD-2026-022');
      expect(load.referenceNumber).toBeUndefined();
    });
  });

  describe('enriched rows', () => {
    it('driver row shows assigned unit and status', async () => {
      prisma.driver.findMany.mockResolvedValue([
        { driverId: 'DRV-1', name: 'Mike Rodriguez', status: 'ACTIVE', assignedVehicle: { unitNumber: '204' } },
      ]);
      const r = (await service.search(TENANT, 'mike', 10)).find((x) => x.type === 'driver')!;
      expect(r.label).toBe('Mike Rodriguez');
      expect(r.description).toBe('Unit 204 · ACTIVE');
      expect(r.href).toContain('/dispatcher/fleet');
    });

    it('driver row without an assigned vehicle shows only status', async () => {
      prisma.driver.findMany.mockResolvedValue([
        { driverId: 'DRV-2', name: 'Maria Walsh', status: 'INACTIVE', assignedVehicle: null },
      ]);
      const r = (await service.search(TENANT, 'maria', 10)).find((x) => x.type === 'driver')!;
      expect(r.description).toBe('INACTIVE');
    });

    it('customer row shows location and type', async () => {
      prisma.customer.findMany.mockResolvedValue([
        {
          customerId: 'CUS-1',
          companyName: 'Walmart Distribution',
          city: 'Bentonville',
          state: 'AR',
          customerType: 'SHIPPER',
        },
      ]);
      const r = (await service.search(TENANT, 'walmart', 10)).find((x) => x.type === 'customer')!;
      expect(r.label).toBe('Walmart Distribution');
      expect(r.description).toBe('Bentonville, AR · SHIPPER');
      expect(r.href).toContain('/dispatcher/network');
    });

    it('invoice row shows its load (with ref), customer, amount, status', async () => {
      prisma.invoice.findMany.mockResolvedValue([
        {
          invoiceNumber: 'INV-8821',
          totalCents: 420000,
          status: 'OVERDUE',
          load: { loadNumber: 'LD-2026-001', referenceNumber: 'PO-88421' },
          customer: { companyName: 'Walmart' },
        },
      ]);
      const r = (await service.search(TENANT, 'INV-8821', 10)).find((x) => x.type === 'invoice')!;
      expect(r.description).toBe('Load LD-2026-001 (PO-88421) · Walmart · $4,200 · OVERDUE');
      expect(r.href).toContain('/dispatcher/billing');
    });

    it('invoice row omits the ref parens when the load has no reference', async () => {
      prisma.invoice.findMany.mockResolvedValue([
        {
          invoiceNumber: 'INV-8830',
          totalCents: 365000,
          status: 'SENT',
          load: { loadNumber: 'LD-2026-014', referenceNumber: null },
          customer: { companyName: 'Costco' },
        },
      ]);
      const r = (await service.search(TENANT, 'INV-8830', 10)).find((x) => x.type === 'invoice')!;
      expect(r.description).toBe('Load LD-2026-014 · Costco · $3,650 · SENT');
    });
  });

  describe('new entity types', () => {
    it('settlement row shows driver, period, net pay, status', async () => {
      prisma.settlement.findMany.mockResolvedValue([
        {
          settlementNumber: 'STL-2026-014',
          status: 'DRAFT',
          netPayCents: 310000,
          periodStart: new Date('2026-06-01T00:00:00Z'),
          periodEnd: new Date('2026-06-15T00:00:00Z'),
          driver: { name: 'Mike Rodriguez' },
        },
      ]);
      const r = (await service.search(TENANT, 'STL', 10)).find((x) => x.type === 'settlement')!;
      expect(r.id).toBe('STL-2026-014');
      expect(r.description).toBe('Mike Rodriguez · Jun 1–15 · $3,100 net · DRAFT');
      expect(r.href).toBe('/dispatcher/pay?open=STL-2026-014');
    });

    it('vehicle row matches unit/make/model/plate/vin and shows make+driver+status', async () => {
      prisma.vehicle.findMany.mockResolvedValue([
        {
          vehicleId: 'VEH-1',
          unitNumber: '204',
          year: 2022,
          make: 'Peterbilt',
          model: '389',
          status: 'ASSIGNED',
          assignedDriver: { name: 'Mike Rodriguez' },
        },
      ]);
      const r = (await service.search(TENANT, '204', 10)).find((x) => x.type === 'vehicle')!;
      expect(r.label).toBe('Unit 204');
      expect(r.description).toBe('2022 Peterbilt 389 · Mike Rodriguez · ASSIGNED');
      const orFields = prisma.vehicle.findMany.mock.calls[0][0].where.OR.map((c: any) => Object.keys(c)[0]);
      expect(orFields).toEqual(expect.arrayContaining(['unitNumber', 'make', 'model', 'licensePlate', 'vin']));
    });

    it('trip row shows driver, load count, status', async () => {
      prisma.trip.findMany.mockResolvedValue([
        { tripId: 'TRIP-0308-001', status: 'IN_PROGRESS', loadCount: 5, driver: { name: 'Mike Rodriguez' } },
      ]);
      const r = (await service.search(TENANT, 'TRIP', 10)).find((x) => x.type === 'trip')!;
      expect(r.description).toBe('Mike Rodriguez · 5 loads · IN_PROGRESS');
    });

    it('trailer row shows equipment + status', async () => {
      prisma.trailer.findMany.mockResolvedValue([
        { trailerId: 'TRL-1', unitNumber: 'TR-28', equipmentType: 'REEFER', status: 'ASSIGNED' },
      ]);
      const r = (await service.search(TENANT, 'TR-28', 10)).find((x) => x.type === 'trailer')!;
      expect(r.label).toBe('TR-28');
      expect(r.description).toBe('REEFER · ASSIGNED');
    });

    it('recurring lane matches name/lane/customer/cities, shows lane+commodity+rate, excludes soft-deleted', async () => {
      prisma.recurringLane.findMany.mockResolvedValue([
        {
          laneId: 'LANE-1',
          name: 'Walmart Denver',
          customerName: 'Walmart',
          commodityType: 'Dry Van',
          rateCents: 280000,
          status: 'ACTIVE',
          originCity: 'Chicago',
          originState: 'IL',
          destinationCity: 'Denver',
          destinationState: 'CO',
        },
      ]);
      const r = (await service.search(TENANT, 'denver', 10)).find((x) => x.type === 'lane')!;
      expect(r.label).toBe('Walmart Denver');
      expect(r.description).toBe('Chicago, IL → Denver, CO · Dry Van · $2,800 · ACTIVE');
      expect(prisma.recurringLane.findMany.mock.calls[0][0].where.deletedAt).toBeNull();
    });
  });

  it('concatenates results across every entity type', async () => {
    prisma.load.findMany.mockResolvedValue([
      { loadNumber: 'LD-1', referenceNumber: null, customerName: 'X', status: 'PENDING' },
    ]);
    prisma.driver.findMany.mockResolvedValue([{ driverId: 'D-1', name: 'A', status: 'ACTIVE', assignedVehicle: null }]);
    prisma.customer.findMany.mockResolvedValue([
      { customerId: 'C-1', companyName: 'Y', city: null, state: null, customerType: 'BROKER' },
    ]);

    const result = await service.search(TENANT, 'test', 10);
    const types = result.map((r) => r.type);
    expect(types).toEqual(['load', 'driver', 'customer']);
  });
});
