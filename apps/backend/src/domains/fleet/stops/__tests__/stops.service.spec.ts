import { Test, TestingModule } from '@nestjs/testing';
import { StopsService } from '../stops.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { GeocodingService } from '../../../platform-services/geocoding/geocoding.service';
import { createMockPrisma } from '../../../../test/mocks';
import { makeStop } from '../../../../test/factories';

describe('StopsService', () => {
  let service: StopsService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let geocodingService: any;

  beforeEach(async () => {
    prisma = createMockPrisma();
    geocodingService = {
      geocodeStop: jest.fn().mockResolvedValue({
        latitude: 32.7767,
        longitude: -96.797,
        confidence: 0.9,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StopsService,
        { provide: PrismaService, useValue: prisma },
        { provide: GeocodingService, useValue: geocodingService },
      ],
    }).compile();

    service = module.get<StopsService>(StopsService);
  });

  // ─── search ──────────────────────────────────────────────

  describe('search', () => {
    it('should search stops by name/address/city with tenant isolation', async () => {
      const stop = {
        ...makeStop(),
        _count: { loadStops: 5 },
        loadStops: [{ actualDockHours: 2, estimatedDockHours: 3 }],
      };
      prisma.stop.findMany.mockResolvedValue([stop]);

      const result = await service.search(1, 'Dallas');

      expect(prisma.stop.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 1,
            isActive: true,
            OR: expect.arrayContaining([{ name: { contains: 'Dallas', mode: 'insensitive' } }]),
          }),
        }),
      );
      expect(result).toHaveLength(1);
      expect(result[0].useCount).toBe(5);
      expect(result[0].avgDockHours).toBe(2); // actual takes precedence
    });

    it('should compute avgDockHours from mixed actual/estimated', async () => {
      const stop = {
        ...makeStop(),
        _count: { loadStops: 3 },
        loadStops: [
          { actualDockHours: 4, estimatedDockHours: 2 },
          { actualDockHours: null, estimatedDockHours: 6 },
          { actualDockHours: null, estimatedDockHours: null },
        ],
      };
      prisma.stop.findMany.mockResolvedValue([stop]);

      const result = await service.search(1, 'test');

      // (4 + 6) / 2 = 5.0
      expect(result[0].avgDockHours).toBe(5);
    });

    it('should escape special chars in search query', async () => {
      prisma.stop.findMany.mockResolvedValue([]);

      await service.search(1, '100% Main_St');

      const callArgs = prisma.stop.findMany.mock.calls[0][0];
      expect(callArgs.where.OR[0].name.contains).toBe('100\\% Main\\_St');
    });
  });

  // ─── getRecent ───────────────────────────────────────────

  describe('getRecent', () => {
    it('should return deduplicated recent stops', async () => {
      const stop1 = {
        ...makeStop({ id: 1, stopId: 'stp-1' }),
        _count: { loadStops: 3 },
      };
      const stop2 = {
        ...makeStop({ id: 2, stopId: 'stp-2' }),
        _count: { loadStops: 1 },
      };
      prisma.loadStop.findMany.mockResolvedValue([
        { stop: stop1, createdAt: new Date() },
        { stop: stop1, createdAt: new Date() }, // duplicate
        { stop: stop2, createdAt: new Date() },
      ]);

      const result = await service.getRecent(1, 5);

      // Should deduplicate — only 2 unique stops
      expect(result).toHaveLength(2);
      expect(result[0].stopId).toBe('stp-1');
      expect(result[1].stopId).toBe('stp-2');
    });

    it('should limit results', async () => {
      const stops = Array.from({ length: 10 }, (_, i) => ({
        stop: {
          ...makeStop({ id: i + 1, stopId: `stp-${i}` }),
          _count: { loadStops: 1 },
        },
        createdAt: new Date(),
      }));
      prisma.loadStop.findMany.mockResolvedValue(stops);

      const result = await service.getRecent(1, 3);

      expect(result).toHaveLength(3);
    });
  });

  // ─── findOrCreate ────────────────────────────────────────

  describe('findOrCreate', () => {
    it('should match existing stop by normalized address + zip', async () => {
      const existing = makeStop({ address: '1234 Commerce Street' });
      prisma.stop.findMany.mockResolvedValue([existing]);

      const result = await service.findOrCreate(1, {
        name: 'Dallas DC',
        address: '1234 Commerce St.',
        zipCode: '75201',
      });

      expect(result.isNew).toBe(false);
      expect(result.stop.id).toBe(existing.id);
    });

    it('does NOT match a different-city stop that shares a generic name (SQ-112)', async () => {
      // A no-street ratecon stop named "Unknown Facility" in Taunton MA must not
      // collide with a pre-existing "Unknown Facility" in another city. Name-only
      // matching was the SQ-112 wrong-location root cause — it's removed.
      prisma.stop.findMany.mockResolvedValue([]); // no address+zip candidates
      const created = makeStop({ id: 2, name: 'Unknown Facility', city: 'Taunton', state: 'MA' });
      prisma.stop.create.mockResolvedValue(created);

      const result = await service.findOrCreate(1, {
        name: 'Unknown Facility',
        city: 'Taunton',
        state: 'MA',
      });

      expect(result.isNew).toBe(true);
      expect(prisma.stop.create).toHaveBeenCalled();
      expect(prisma.stop.findFirst).not.toHaveBeenCalled(); // no name-match query at all
    });

    it('should create new stop when no match found', async () => {
      prisma.stop.findMany.mockResolvedValue([]);
      prisma.stop.findFirst.mockResolvedValue(null);
      const newStop = makeStop({ id: 99, stopId: 'STOP-new' });
      prisma.stop.create.mockResolvedValue(newStop);

      const result = await service.findOrCreate(1, {
        name: 'New Place',
        address: '9999 New Rd',
        zipCode: '99999',
      });

      expect(result.isNew).toBe(true);
      expect(prisma.stop.create).toHaveBeenCalled();
    });
  });

  // ─── update ──────────────────────────────────────────────

  describe('update', () => {
    it('should update stop fields', async () => {
      const stop = makeStop();
      prisma.stop.findFirst.mockResolvedValue(stop);
      prisma.stop.update.mockResolvedValue({ ...stop, name: 'Updated DC' });

      const result = await service.update(1, 1, { name: 'Updated DC' });

      expect(result?.name).toBe('Updated DC');
    });

    it('should re-geocode when address changes', async () => {
      const stop = makeStop({ address: '1234 Commerce St' });
      prisma.stop.findFirst.mockResolvedValue(stop);
      prisma.stop.update
        .mockResolvedValueOnce({ ...stop, address: '5678 New Ave' })
        .mockResolvedValueOnce({ ...stop, lat: 33.0, lon: -97.0 });

      await service.update(1, 1, { address: '5678 New Ave' });

      expect(geocodingService.geocodeStop).toHaveBeenCalled();
    });

    it('should NOT re-geocode when only name changes', async () => {
      const stop = makeStop();
      prisma.stop.findFirst.mockResolvedValue(stop);
      prisma.stop.update.mockResolvedValue({ ...stop, name: 'Renamed' });

      await service.update(1, 1, { name: 'Renamed' });

      expect(geocodingService.geocodeStop).not.toHaveBeenCalled();
    });

    it('should return null when stop not found', async () => {
      prisma.stop.findFirst.mockResolvedValue(null);

      const result = await service.update(1, 999, { name: 'X' });

      expect(result).toBeNull();
    });

    it('should skip geocode update when confidence is below threshold', async () => {
      const stop = makeStop({ address: '1234 Commerce St' });
      prisma.stop.findFirst.mockResolvedValue(stop);
      prisma.stop.update.mockResolvedValue({
        ...stop,
        address: '5678 New Ave',
      });
      geocodingService.geocodeStop.mockResolvedValue({
        latitude: 0,
        longitude: 0,
        confidence: 0.3,
      });

      await service.update(1, 1, { address: '5678 New Ave' });

      // update called once for the field update, but NOT a second time for geocoding
      expect(prisma.stop.update).toHaveBeenCalledTimes(1);
    });
  });

  // ─── list ───────────────────────────────────────────────────

  describe('list', () => {
    it('should return paginated stops', async () => {
      const stop = { ...makeStop(), _count: { loadStops: 3 } };
      prisma.stop.findMany.mockResolvedValue([stop]);
      prisma.stop.count.mockResolvedValue(1);

      const result = await service.list(1, {});

      expect(result.items).toHaveLength(1);
      expect(result.items[0].loadCount).toBe(3);
      expect(result.items[0].isEditable).toBe(true);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
    });

    it('should filter by search query', async () => {
      prisma.stop.findMany.mockResolvedValue([]);
      prisma.stop.count.mockResolvedValue(0);

      await service.list(1, { q: 'Dallas' });

      expect(prisma.stop.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.objectContaining({
              OR: expect.arrayContaining([{ name: { contains: 'Dallas', mode: 'insensitive' } }]),
            }),
          }),
        }),
      );
    });

    it('should filter by type', async () => {
      prisma.stop.findMany.mockResolvedValue([]);
      prisma.stop.count.mockResolvedValue(0);

      await service.list(1, { type: 'WAREHOUSE' });

      expect(prisma.stop.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            locationType: 'WAREHOUSE',
          }),
        }),
      );
    });

    it('should filter by state', async () => {
      prisma.stop.findMany.mockResolvedValue([]);
      prisma.stop.count.mockResolvedValue(0);

      await service.list(1, { state: 'TX' });

      expect(prisma.stop.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            state: { equals: 'TX', mode: 'insensitive' },
          }),
        }),
      );
    });

    it('should sort by allowed field', async () => {
      prisma.stop.findMany.mockResolvedValue([]);
      prisma.stop.count.mockResolvedValue(0);

      await service.list(1, { sortBy: 'city', sortOrder: 'desc' });

      expect(prisma.stop.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { city: 'desc' },
        }),
      );
    });

    it('should default sort to name when invalid sortBy', async () => {
      prisma.stop.findMany.mockResolvedValue([]);
      prisma.stop.count.mockResolvedValue(0);

      await service.list(1, { sortBy: 'invalidField' as any });

      expect(prisma.stop.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { name: 'asc' },
        }),
      );
    });

    it('should mark non-tenant stops as non-editable', async () => {
      const globalStop = {
        ...makeStop({ tenantId: null }),
        _count: { loadStops: 0 },
      };
      prisma.stop.findMany.mockResolvedValue([globalStop]);
      prisma.stop.count.mockResolvedValue(1);

      const result = await service.list(1, {});
      expect(result.items[0].isEditable).toBe(false);
    });

    it('should calculate totalPages', async () => {
      prisma.stop.findMany.mockResolvedValue([]);
      prisma.stop.count.mockResolvedValue(100);

      const result = await service.list(1, { page: 1, limit: 25 });
      expect(result.totalPages).toBe(4);
    });
  });

  // ─── getById ────────────────────────────────────────────────

  describe('getById', () => {
    it('should return stop with loadCount and isEditable', async () => {
      const stop = { ...makeStop(), _count: { loadStops: 7 } };
      prisma.stop.findFirst.mockResolvedValue(stop);

      const result = await service.getById(1, 1);

      expect(result).toBeDefined();
      expect(result.loadCount).toBe(7);
      expect(result.isEditable).toBe(true);
    });

    it('should return null when stop not found', async () => {
      prisma.stop.findFirst.mockResolvedValue(null);

      const result = await service.getById(1, 999);
      expect(result).toBeNull();
    });

    it('should mark global stops as non-editable', async () => {
      const globalStop = {
        ...makeStop({ tenantId: null }),
        _count: { loadStops: 0 },
      };
      prisma.stop.findFirst.mockResolvedValue(globalStop);

      const result = await service.getById(1, 1);
      expect(result.isEditable).toBe(false);
    });
  });

  // ─── update edge cases ──────────────────────────────────────

  describe('update edge cases', () => {
    it('should handle geocoding failure gracefully', async () => {
      const stop = makeStop({ address: '1234 Commerce St' });
      prisma.stop.findFirst.mockResolvedValue(stop);
      prisma.stop.update.mockResolvedValue({ ...stop, address: '9999 Bad Rd' });
      geocodingService.geocodeStop.mockRejectedValue(new Error('Geocoding API down'));

      const result = await service.update(1, 1, { address: '9999 Bad Rd' });

      // Should still return the updated stop even if geocoding fails
      expect(result).toBeDefined();
      expect(result.address).toBe('9999 Bad Rd');
    });

    it('should update contact info and operating hours', async () => {
      const stop = makeStop();
      prisma.stop.findFirst.mockResolvedValue(stop);
      prisma.stop.update.mockResolvedValue({
        ...stop,
        contactName: 'Jane Doe',
        contactPhone: '555-1234',
        contactEmail: 'jane@example.com',
        notes: 'Back dock only',
      });

      await service.update(1, 1, {
        contactName: 'Jane Doe',
        contactPhone: '555-1234',
        contactEmail: 'jane@example.com',
        notes: 'Back dock only',
        appointmentRequired: true,
        operatingHours: { mon: { open: '08:00', close: '17:00' } },
      });

      expect(prisma.stop.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            contactName: 'Jane Doe',
            contactPhone: '555-1234',
            appointmentRequired: true,
          }),
        }),
      );
    });

    it('should re-geocode when city changes', async () => {
      const stop = makeStop({ city: 'Dallas', address: '100 Main St' });
      prisma.stop.findFirst.mockResolvedValue(stop);
      prisma.stop.update.mockResolvedValueOnce({ ...stop, city: 'Houston' }).mockResolvedValueOnce({
        ...stop,
        city: 'Houston',
        lat: 29.7,
        lon: -95.3,
      });

      await service.update(1, 1, { city: 'Houston' });

      expect(geocodingService.geocodeStop).toHaveBeenCalled();
    });

    it('should re-geocode when state changes', async () => {
      const stop = makeStop({ state: 'TX', address: '100 Main St' });
      prisma.stop.findFirst.mockResolvedValue(stop);
      prisma.stop.update.mockResolvedValueOnce({ ...stop, state: 'CA' }).mockResolvedValueOnce({
        ...stop,
        state: 'CA',
        lat: 34.0,
        lon: -118.2,
      });

      await service.update(1, 1, { state: 'CA' });

      expect(geocodingService.geocodeStop).toHaveBeenCalled();
    });

    it('should re-geocode when zipCode changes', async () => {
      const stop = makeStop({ zipCode: '75201', address: '100 Main St' });
      prisma.stop.findFirst.mockResolvedValue(stop);
      prisma.stop.update
        .mockResolvedValueOnce({ ...stop, zipCode: '90210' })
        .mockResolvedValueOnce({ ...stop, zipCode: '90210' });

      await service.update(1, 1, { zipCode: '90210' });

      expect(geocodingService.geocodeStop).toHaveBeenCalled();
    });
  });

  // ─── findOrCreate edge cases ────────────────────────────────

  describe('findOrCreate edge cases', () => {
    it('should create stop when no address or zipCode for matching', async () => {
      prisma.stop.findFirst.mockResolvedValue(null); // no name match
      const newStop = makeStop({ id: 50, stopId: 'STOP-new' });
      prisma.stop.create.mockResolvedValue(newStop);

      const result = await service.findOrCreate(1, {
        name: 'Unknown Location',
      });

      expect(result.isNew).toBe(true);
      expect(prisma.stop.create).toHaveBeenCalled();
    });

    it('should not match address when candidate has no address', async () => {
      prisma.stop.findMany.mockResolvedValue([makeStop({ id: 1, address: null })]);
      prisma.stop.findFirst.mockResolvedValue(null); // no name match
      const newStop = makeStop({ id: 50 });
      prisma.stop.create.mockResolvedValue(newStop);

      const result = await service.findOrCreate(1, {
        name: 'Test',
        address: '123 Main St',
        zipCode: '75201',
      });

      expect(result.isNew).toBe(true);
    });
  });

  // ─── list pagination ────────────────────────────────────────

  describe('list pagination edge cases', () => {
    it('should correctly calculate pagination offset', async () => {
      prisma.stop.findMany.mockResolvedValue([]);
      prisma.stop.count.mockResolvedValue(0);

      await service.list(1, { page: 3, limit: 10 });

      expect(prisma.stop.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20, // (3 - 1) * 10
          take: 10,
        }),
      );
    });
  });
});
