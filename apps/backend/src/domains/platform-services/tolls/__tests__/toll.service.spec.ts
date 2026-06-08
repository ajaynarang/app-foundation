import { Test, TestingModule } from '@nestjs/testing';
import { TollService } from '../toll.service';
import { PlatformServicesConfig } from '../../platform-services.config';
import { PlatformHealthService } from '../../platform-health.service';
import { HereTollProvider } from '../providers/here-toll.provider';

const mockHereToll = {
  calculateRouteTolls: jest.fn().mockResolvedValue({
    total_cost_cents: 4500,
    currency: 'USD',
    toll_points: [],
  }),
};

const mockHealth = {
  withHealthTracking: jest.fn((name, fn) => fn()),
};

describe('TollService', () => {
  let service: TollService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TollService,
        {
          provide: PlatformServicesConfig,
          useValue: { tolls: { provider: 'here' } },
        },
        { provide: PlatformHealthService, useValue: mockHealth },
        { provide: HereTollProvider, useValue: mockHereToll },
      ],
    }).compile();
    service = module.get<TollService>(TollService);
  });

  it('should calculate tolls with health tracking', async () => {
    const waypoints = [
      { lat: 32, lng: -96 },
      { lat: 29, lng: -95 },
    ] as any;
    const result = await service.calculateRouteTolls(waypoints, 'CLASS_8');
    expect(result.total_cost_cents).toBe(4500);
    expect(mockHealth.withHealthTracking).toHaveBeenCalledWith('tolls', expect.any(Function));
  });
});
