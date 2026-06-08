import { Test } from '@nestjs/testing';
import { DataSourceResolverService } from '../data-source-resolver.service';
import { DataSourceRegistry } from '../../data-sources/data-source.registry';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { DataSourceDefinition } from '../../monitoring.types';

describe('DataSourceResolverService', () => {
  let service: DataSourceResolverService;
  let prisma: any;
  let registry: any;

  const mockIntegrationSource: DataSourceDefinition = {
    id: 'hos',
    displayName: 'HOS Data',
    provides: ['hos_data'],
    sourceType: 'integration',
    freshnessStrategy: 'schedule',
    integrationRequirement: { type: 'ELD', status: 'ACTIVE' },
  };

  const mockPlatformSource: DataSourceDefinition = {
    id: 'weather',
    displayName: 'Weather',
    provides: ['weather_data'],
    sourceType: 'platform_service',
    freshnessStrategy: 'ttl',
    platformServiceKey: 'openweather',
  };

  const mockTtlSource: DataSourceDefinition = {
    id: 'loads',
    displayName: 'Loads',
    provides: ['load_data'],
    sourceType: 'integration',
    freshnessStrategy: 'ttl',
    integrationRequirement: { type: 'TMS', status: 'ACTIVE' },
  };

  const mockNoMappingSource: DataSourceDefinition = {
    id: 'custom',
    displayName: 'Custom',
    provides: ['custom_data'],
    sourceType: 'integration',
    freshnessStrategy: 'schedule',
    integrationRequirement: { type: 'TMS', status: 'ACTIVE' },
  };

  beforeEach(async () => {
    prisma = {
      integrationConfig: { findMany: jest.fn().mockResolvedValue([]) },
      jobSchedule: { findMany: jest.fn().mockResolvedValue([]) },
      job: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    registry = {
      getAll: jest.fn().mockReturnValue([mockIntegrationSource]),
    };

    const module = await Test.createTestingModule({
      providers: [
        DataSourceResolverService,
        { provide: DataSourceRegistry, useValue: registry },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(DataSourceResolverService);
  });

  describe('resolveForTenant', () => {
    it('should mark integration source as not_configured when no integration', async () => {
      const results = await service.resolveForTenant(1);
      expect(results).toHaveLength(1);
      expect(results[0].available).toBe(false);
      expect(results[0].status).toBe('not_configured');
    });

    it('should mark integration source as available when integration exists', async () => {
      prisma.integrationConfig.findMany.mockResolvedValue([
        { integrationType: 'ELD', status: 'ACTIVE', isEnabled: true },
      ]);
      prisma.job.findFirst.mockResolvedValue({ completedAt: new Date() });
      const results = await service.resolveForTenant(1);
      expect(results[0].available).toBe(true);
    });

    it('should mark platform_service as healthy', async () => {
      registry.getAll.mockReturnValue([mockPlatformSource]);
      const results = await service.resolveForTenant(1);
      expect(results[0].status).toBe('healthy');
      expect(results[0].available).toBe(true);
    });

    it('should return healthy for TTL-based sources with integration', async () => {
      registry.getAll.mockReturnValue([mockTtlSource]);
      prisma.integrationConfig.findMany.mockResolvedValue([
        { integrationType: 'TMS', status: 'ACTIVE', isEnabled: true },
      ]);
      const results = await service.resolveForTenant(1);
      expect(results[0].status).toBe('healthy');
    });

    it('should return never when no completed job found', async () => {
      prisma.integrationConfig.findMany.mockResolvedValue([
        { integrationType: 'ELD', status: 'ACTIVE', isEnabled: true },
      ]);
      prisma.job.findFirst.mockResolvedValue(null);
      const results = await service.resolveForTenant(1);
      expect(results[0].status).toBe('never');
    });

    it('should return healthy when job is recent', async () => {
      prisma.integrationConfig.findMany.mockResolvedValue([
        { integrationType: 'ELD', status: 'ACTIVE', isEnabled: true },
      ]);
      prisma.jobSchedule.findMany.mockResolvedValue([
        {
          category: 'eld',
          jobType: 'hos',
          intervalMs: 600000,
          isEnabled: true,
        },
      ]);
      prisma.job.findFirst.mockResolvedValue({ completedAt: new Date() });
      const results = await service.resolveForTenant(1);
      expect(results[0].status).toBe('healthy');
    });

    it('should return stale when job is very old', async () => {
      prisma.integrationConfig.findMany.mockResolvedValue([
        { integrationType: 'ELD', status: 'ACTIVE', isEnabled: true },
      ]);
      prisma.jobSchedule.findMany.mockResolvedValue([
        { category: 'eld', jobType: 'hos', intervalMs: 60000, isEnabled: true },
      ]);
      prisma.job.findFirst.mockResolvedValue({
        completedAt: new Date(Date.now() - 600000), // 10 min old for 1-min interval
      });
      const results = await service.resolveForTenant(1);
      expect(results[0].status).toBe('stale');
    });

    it('should return delayed when job is moderately old', async () => {
      prisma.integrationConfig.findMany.mockResolvedValue([
        { integrationType: 'ELD', status: 'ACTIVE', isEnabled: true },
      ]);
      prisma.jobSchedule.findMany.mockResolvedValue([
        { category: 'eld', jobType: 'hos', intervalMs: 60000, isEnabled: true },
      ]);
      prisma.job.findFirst.mockResolvedValue({
        completedAt: new Date(Date.now() - 240000), // 4 min old for 1-min interval (3x < 4 < 5x)
      });
      const results = await service.resolveForTenant(1);
      expect(results[0].status).toBe('delayed');
    });

    it('should handle cron pattern for interval calculation', async () => {
      prisma.integrationConfig.findMany.mockResolvedValue([
        { integrationType: 'ELD', status: 'ACTIVE', isEnabled: true },
      ]);
      prisma.jobSchedule.findMany.mockResolvedValue([
        {
          category: 'eld',
          jobType: 'hos',
          intervalMs: null,
          pattern: '*/5 * * * *',
          isEnabled: true,
        },
      ]);
      prisma.job.findFirst.mockResolvedValue({ completedAt: new Date() });
      const results = await service.resolveForTenant(1);
      expect(results[0].status).toBe('healthy');
    });

    it('should handle source with no job mapping as healthy', async () => {
      registry.getAll.mockReturnValue([mockNoMappingSource]);
      prisma.integrationConfig.findMany.mockResolvedValue([
        { integrationType: 'TMS', status: 'ACTIVE', isEnabled: true },
      ]);
      const results = await service.resolveForTenant(1);
      expect(results[0].status).toBe('healthy');
    });
  });

  describe('getAvailableCapabilities', () => {
    it('should return capabilities from healthy sources', async () => {
      prisma.integrationConfig.findMany.mockResolvedValue([
        { integrationType: 'ELD', status: 'ACTIVE', isEnabled: true },
      ]);
      prisma.job.findFirst.mockResolvedValue({ completedAt: new Date() });
      const caps = await service.getAvailableCapabilities(1);
      expect(caps).toContain('hos_data');
    });

    it('should return empty for not_configured sources', async () => {
      const caps = await service.getAvailableCapabilities(1);
      expect(caps).toHaveLength(0);
    });
  });

  describe('getAvailableCapabilitiesFromResolved', () => {
    it('should return caps from available non-stale sources', () => {
      const caps = service.getAvailableCapabilitiesFromResolved([
        {
          definition: mockIntegrationSource,
          available: true,
          status: 'healthy',
          lastSyncAge: 10,
        },
        {
          definition: mockPlatformSource,
          available: false,
          status: 'not_configured',
          lastSyncAge: null,
        },
      ]);
      expect(caps.has('hos_data')).toBe(true);
      expect(caps.has('weather_data')).toBe(false);
    });

    it('should exclude stale and never sources', () => {
      const caps = service.getAvailableCapabilitiesFromResolved([
        {
          definition: mockIntegrationSource,
          available: true,
          status: 'stale',
          lastSyncAge: 999,
        },
        {
          definition: mockTtlSource,
          available: true,
          status: 'never',
          lastSyncAge: null,
        },
      ]);
      expect(caps.size).toBe(0);
    });
  });
});
