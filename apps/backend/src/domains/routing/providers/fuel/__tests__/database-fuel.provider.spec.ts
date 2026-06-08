import { Test } from '@nestjs/testing';
import { DatabaseFuelProvider } from '../database-fuel.provider';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

describe('DatabaseFuelProvider', () => {
  let provider: DatabaseFuelProvider;
  let prisma: any;

  const mockStops = [
    {
      stopId: 's-1',
      name: 'Pilot #123',
      lat: 32.78,
      lon: -96.8,
      city: 'Dallas',
      state: 'TX',
      fuelPricePerGallon: 3.49,
      fuelBrand: 'Pilot',
      amenities: ['Shower', 'WiFi'],
    },
    {
      stopId: 's-2',
      name: "Love's #456",
      lat: 32.75,
      lon: -96.82,
      city: 'Dallas',
      state: 'TX',
      fuelPricePerGallon: 3.59,
      fuelBrand: "Love's",
      amenities: [],
    },
    {
      stopId: 's-3',
      name: 'Far Away Stop',
      lat: 40.7,
      lon: -74.0,
      city: 'NYC',
      state: 'NY',
      fuelPricePerGallon: 4.09,
      fuelBrand: null,
      amenities: null,
    },
  ];

  beforeEach(async () => {
    prisma = {
      stop: { findMany: jest.fn().mockResolvedValue(mockStops) },
    };

    const module = await Test.createTestingModule({
      providers: [DatabaseFuelProvider, { provide: PrismaService, useValue: prisma }],
    }).compile();

    provider = module.get(DatabaseFuelProvider);
  });

  describe('findFuelStopsNearPoint', () => {
    it('should return stops within radius', async () => {
      const result = await provider.findFuelStopsNearPoint(32.77, -96.81, 5);
      // Dallas stops should be within 5 miles, NYC should not
      expect(result.length).toBe(2);
      expect(result[0].name).toContain('Pilot'); // cheaper first
    });

    it('should sort by fuel price ascending', async () => {
      const result = await provider.findFuelStopsNearPoint(32.77, -96.81, 50);
      for (let i = 1; i < result.length; i++) {
        expect(result[i].fuelPricePerGallon).toBeGreaterThanOrEqual(result[i - 1].fuelPricePerGallon);
      }
    });

    it('should filter by accepted brands', async () => {
      await provider.findFuelStopsNearPoint(32.77, -96.81, 50, {
        acceptedBrands: ['Pilot'],
      });
      expect(prisma.stop.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ fuelBrand: { in: ['Pilot'] } }),
        }),
      );
    });

    it('should return empty for very small radius', async () => {
      const result = await provider.findFuelStopsNearPoint(0, 0, 0.001);
      expect(result).toHaveLength(0);
    });
  });

  describe('findFuelStopsAlongCorridor', () => {
    it('should return stops within corridor', async () => {
      const result = await provider.findFuelStopsAlongCorridor(32.7, -96.9, 32.85, -96.7, 5);
      expect(result.length).toBe(2); // Dallas stops near corridor
    });

    it('should handle zero-length corridor', async () => {
      const result = await provider.findFuelStopsAlongCorridor(32.78, -96.8, 32.78, -96.8, 1);
      expect(result.length).toBeGreaterThanOrEqual(0);
    });
  });
});
