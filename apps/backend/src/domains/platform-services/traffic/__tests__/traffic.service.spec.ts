import { Test, TestingModule } from '@nestjs/testing';
import { TrafficService } from '../traffic.service';
import { PlatformServicesConfig } from '../../platform-services.config';
import { PlatformHealthService } from '../../platform-health.service';
import { HereTrafficProvider } from '../providers/here-traffic.provider';

const mockHereTraffic = {
  getTrafficFlow: jest.fn().mockResolvedValue([
    {
      start: { lat: 32, lng: -96 },
      end: { lat: 33, lng: -96 },
      speed_mph: 55,
      free_flow_speed_mph: 65,
      jam_factor: 2,
    },
  ]),
  getIncidents: jest.fn().mockResolvedValue([{ type: 'construction', severity: 'moderate' }]),
};

const mockHealth = {
  withHealthTracking: jest.fn((name, fn) => fn()),
};

describe('TrafficService', () => {
  let service: TrafficService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrafficService,
        {
          provide: PlatformServicesConfig,
          useValue: { traffic: { provider: 'here' } },
        },
        { provide: PlatformHealthService, useValue: mockHealth },
        { provide: HereTrafficProvider, useValue: mockHereTraffic },
      ],
    }).compile();
    service = module.get<TrafficService>(TrafficService);
  });

  it('should get traffic flow with health tracking', async () => {
    const result = await service.getTrafficFlow([{ lat: 32, lng: -96 }] as any);
    expect(result).toHaveLength(1);
    expect(result[0].speed_mph).toBe(55);
  });

  it('should get incidents', async () => {
    const result = await service.getIncidents(32, -96, 10);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('construction');
  });
});
