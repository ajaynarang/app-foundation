import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import type { PlaceSuggestion } from '@sally/shared-types';
import { StopsService } from '../stops.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { GeocodingService } from '../../../platform-services/geocoding/geocoding.service';
import { createMockPrisma } from '../../../../test/mocks';
import { makeStop } from '../../../../test/factories';

const SUGGESTION: PlaceSuggestion = {
  externalId: 'here:af:abc',
  text: '1245 Industrial Blvd, Dallas, TX 75207',
  street: '1245 Industrial Blvd',
  city: 'Dallas',
  state: 'TX',
  zipCode: '75207',
  lat: 32.7767,
  lon: -96.797,
  provider: 'here',
};

describe('StopsService.findOrCreateFromPlace', () => {
  let service: StopsService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StopsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: GeocodingService,
          useValue: { geocodeStop: jest.fn() },
        },
      ],
    }).compile();
    service = module.get(StopsService);
  });

  it('rejects a suggestion missing coordinates', async () => {
    await expect(service.findOrCreateFromPlace(1, { ...SUGGESTION, lat: null, lon: null })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('matches an existing stop within ~11m of the suggestion coordinates', async () => {
    const existing = makeStop({ id: 5, lat: 32.7767, lon: -96.797, name: 'Walmart DC' });
    prisma.stop.findFirst.mockResolvedValue(existing);

    const result = await service.findOrCreateFromPlace(1, SUGGESTION);

    expect(result.isNew).toBe(false);
    expect(result.stop.id).toBe(5);
    // coord query is tenant-scoped and bounded
    const where = prisma.stop.findFirst.mock.calls[0][0].where;
    expect(where.tenantId).toBe(1);
    expect(where.lat).toEqual({ gte: 32.7766, lte: 32.7768 });
    expect(where.lon).toEqual({ gte: -96.7971, lte: -96.7969 });
    expect(prisma.stop.create).not.toHaveBeenCalled();
  });

  it('creates a new stop with coordinates persisted when no coord match exists', async () => {
    prisma.stop.findFirst.mockResolvedValue(null); // no coord match
    prisma.stop.findMany.mockResolvedValue([]); // no address-dedup match
    prisma.stop.create.mockImplementation(({ data }: any) => Promise.resolve(makeStop({ id: 9, ...data })));

    const result = await service.findOrCreateFromPlace(1, SUGGESTION);

    expect(result.isNew).toBe(true);
    const created = prisma.stop.create.mock.calls[0][0].data;
    expect(created.lat).toBe(32.7767);
    expect(created.lon).toBe(-96.797);
    expect(created.address).toBe('1245 Industrial Blvd');
    expect(created.city).toBe('Dallas');
    expect(created.name).toBe('1245 Industrial Blvd, Dallas, TX 75207'); // from suggestion.text
  });

  it('uses overrideName as the Stop name when provided', async () => {
    prisma.stop.findFirst.mockResolvedValue(null);
    prisma.stop.findMany.mockResolvedValue([]);
    prisma.stop.create.mockImplementation(({ data }: any) => Promise.resolve(makeStop({ id: 9, ...data })));

    await service.findOrCreateFromPlace(1, SUGGESTION, 'Walmart DC #6094');

    expect(prisma.stop.create.mock.calls[0][0].data.name).toBe('Walmart DC #6094');
  });
});

describe('StopsService.findOrCreate — coordinate persistence', () => {
  let service: StopsService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StopsService,
        { provide: PrismaService, useValue: prisma },
        { provide: GeocodingService, useValue: { geocodeStop: jest.fn() } },
      ],
    }).compile();
    service = module.get(StopsService);
  });

  it('persists lat/lon on a newly created stop when provided', async () => {
    prisma.stop.findMany.mockResolvedValue([]);
    prisma.stop.findFirst.mockResolvedValue(null);
    prisma.stop.create.mockImplementation(({ data }: any) => Promise.resolve(makeStop({ id: 1, ...data })));

    await service.findOrCreate(1, {
      name: 'New Yard',
      address: '500 Dock Rd',
      city: 'Memphis',
      state: 'TN',
      zipCode: '38103',
      lat: 35.1495,
      lon: -90.049,
    });

    const created = prisma.stop.create.mock.calls[0][0].data;
    expect(created.lat).toBe(35.1495);
    expect(created.lon).toBe(-90.049);
  });

  it('leaves lat/lon null when the caller does not provide coordinates', async () => {
    prisma.stop.findMany.mockResolvedValue([]);
    prisma.stop.findFirst.mockResolvedValue(null);
    prisma.stop.create.mockImplementation(({ data }: any) => Promise.resolve(makeStop({ id: 1, ...data })));

    await service.findOrCreate(1, { name: 'No Coords Yard' });

    const created = prisma.stop.create.mock.calls[0][0].data;
    expect(created.lat).toBeNull();
    expect(created.lon).toBeNull();
  });
});
