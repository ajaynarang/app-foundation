import { Test, TestingModule } from '@nestjs/testing';
import { MileageService } from '../mileage.service';
import { PlatformServicesConfig } from '../../platform-services.config';
import { PlatformHealthService } from '../../platform-health.service';
import { HereMileageProvider } from '../providers/here-mileage.provider';
import { TrimblePcMilerProvider } from '../providers/trimble-pcmiler.provider';

const mockTrimble = {
  getRatedMiles: jest.fn().mockResolvedValue({
    origin: '32.7767,-96.797',
    destination: '29.7604,-95.3698',
    rated_miles: 250,
    practical_miles: 250,
    shortest_miles: 240,
    provider: 'trimble',
  }),
  getTruckMiles: jest.fn().mockResolvedValue({
    origin: '0,0',
    destination: '1,1',
    rated_miles: 260,
    practical_miles: 260,
    shortest_miles: 250,
    provider: 'trimble',
  }),
};

const mockHere = {
  getRatedMiles: jest.fn().mockResolvedValue({
    origin: '32.7767,-96.797',
    destination: '29.7604,-95.3698',
    rated_miles: 482,
    practical_miles: 482,
    shortest_miles: 482,
    duration_hours: 7.75,
    provider: 'here',
  }),
  getTruckMiles: jest.fn().mockResolvedValue({
    origin: '0,0',
    destination: '1,1',
    rated_miles: 100,
    practical_miles: 100,
    shortest_miles: 100,
    duration_hours: 1.8,
    provider: 'here',
  }),
};

const mockHealth = {
  withHealthTracking: jest.fn((name, fn) => fn()),
};

async function buildService(provider: 'here' | 'trimble' | 'unknown'): Promise<MileageService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      MileageService,
      { provide: PlatformServicesConfig, useValue: { mileage: { provider } } },
      { provide: PlatformHealthService, useValue: mockHealth },
      { provide: HereMileageProvider, useValue: mockHere },
      { provide: TrimblePcMilerProvider, useValue: mockTrimble },
    ],
  }).compile();
  return module.get<MileageService>(MileageService);
}

describe('MileageService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('provider resolution', () => {
    it('routes to HERE when configured provider is "here"', async () => {
      const service = await buildService('here');
      const result = await service.getTruckMiles({ lat: 0, lng: 0 } as any, { lat: 1, lng: 1 } as any);
      expect(result.provider).toBe('here');
      expect(mockHere.getTruckMiles).toHaveBeenCalled();
      expect(mockTrimble.getTruckMiles).not.toHaveBeenCalled();
    });

    it('routes to PC*Miler when configured provider is "trimble"', async () => {
      const service = await buildService('trimble');
      const result = await service.getTruckMiles({ lat: 0, lng: 0 } as any, { lat: 1, lng: 1 } as any);
      expect(result.provider).toBe('trimble');
      expect(mockTrimble.getTruckMiles).toHaveBeenCalled();
    });

    it('falls back to HERE for an unknown provider', async () => {
      const service = await buildService('unknown');
      const result = await service.getTruckMiles({ lat: 0, lng: 0 } as any, { lat: 1, lng: 1 } as any);
      expect(result.provider).toBe('here');
    });
  });

  describe('getRatedMiles', () => {
    it('delegates to the resolved provider with health tracking', async () => {
      const service = await buildService('here');
      const result = await service.getRatedMiles(
        { lat: 32.7767, lng: -96.797 } as any,
        { lat: 29.7604, lng: -95.3698 } as any,
      );
      expect(result.rated_miles).toBe(482);
      expect(mockHealth.withHealthTracking).toHaveBeenCalledWith('mileage', expect.any(Function));
    });
  });

  describe('getTruckMiles', () => {
    it('returns the provider result with health tracking', async () => {
      const service = await buildService('here');
      const result = await service.getTruckMiles({ lat: 0, lng: 0 } as any, { lat: 1, lng: 1 } as any);
      expect(result.rated_miles).toBe(100);
      expect(mockHealth.withHealthTracking).toHaveBeenCalledWith('mileage', expect.any(Function));
    });
  });
});
