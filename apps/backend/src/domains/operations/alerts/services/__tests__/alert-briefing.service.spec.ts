jest.mock('../../../../../domains/prompting', () => ({
  PromptingService: jest.fn(),
  PROMPT_NAMES: { ALERT_BRIEFING: 'alert-briefing' },
}));

jest.mock('../../../../../domains/ai/sally-ai/mastra/mastra.provider', () => ({
  MastraProvider: jest.fn(),
}));

import { Test } from '@nestjs/testing';
import { AlertBriefingService } from '../alert-briefing.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { AlertCacheService } from '../alert-cache.service';
import { PromptingService } from '../../../../../domains/prompting';
import { MastraProvider } from '../../../../../domains/ai/sally-ai/mastra/mastra.provider';
import { AiTelemetryService } from '../../../../../domains/ai/infrastructure/telemetry/ai-telemetry.service';

describe('AlertBriefingService', () => {
  let service: AlertBriefingService;
  let cache: any;
  let prisma: any;
  let mastraProvider: any;

  beforeEach(async () => {
    cache = { get: jest.fn().mockResolvedValue(null), set: jest.fn() };
    prisma = {
      alert: { findMany: jest.fn().mockResolvedValue([]) },
      driver: { count: jest.fn().mockResolvedValue(5) },
      load: { count: jest.fn().mockResolvedValue(10) },
    };
    mastraProvider = {
      getMastra: jest.fn().mockReturnValue({
        getAgent: jest.fn().mockReturnValue({
          generate: jest.fn().mockResolvedValue({
            text: '{"situations":[{"severity":"high","title":"Test","summary":"s","recommendation":"r","relatedAlertIds":[],"driverIds":[],"loadIds":[]}],"overallStatus":"OK"}',
          }),
        }),
      }),
    };

    const module = await Test.createTestingModule({
      providers: [
        AlertBriefingService,
        { provide: PrismaService, useValue: prisma },
        { provide: AlertCacheService, useValue: cache },
        {
          provide: PromptingService,
          useValue: {
            registerFallback: jest.fn(),
            getPrompt: jest.fn().mockResolvedValue('prompt'),
          },
        },
        { provide: MastraProvider, useValue: mastraProvider },
        { provide: AiTelemetryService, useValue: { record: jest.fn().mockResolvedValue({ id: 'inv' }) } },
      ],
    }).compile();

    service = module.get(AlertBriefingService);
  });

  describe('getCached', () => {
    it('should return cached briefing', async () => {
      const briefing = {
        situations: [],
        overallStatus: 'OK',
        generatedAt: 'x',
      };
      cache.get.mockResolvedValue(briefing);
      const result = await service.getCached(1);
      expect(result).toEqual(briefing);
    });

    it('should return null when no cache', async () => {
      const result = await service.getCached(1);
      expect(result).toBeNull();
    });
  });

  describe('generate', () => {
    it('should return cached if not forced', async () => {
      const briefing = {
        situations: [],
        overallStatus: 'OK',
        generatedAt: 'x',
      };
      cache.get.mockResolvedValue(briefing);
      const result = await service.generate(1, false);
      expect(result).toEqual(briefing);
    });

    it('should generate new briefing', async () => {
      const result = await service.generate(1, true);
      expect(result.situations).toHaveLength(1);
      expect(result.overallStatus).toBe('OK');
      expect(result.generatedAt).toBeDefined();
      expect(cache.set).toHaveBeenCalled();
    });

    it('should handle missing fields in LLM response', async () => {
      mastraProvider.getMastra.mockReturnValue({
        getAgent: jest.fn().mockReturnValue({
          generate: jest.fn().mockResolvedValue({
            text: '{"situations":[{"severity":"medium"}],"overallStatus":""}',
          }),
        }),
      });
      const result = await service.generate(1, true);
      expect(result.situations[0].title).toBe('');
      expect(result.overallStatus).toBe('Briefing generated.');
    });

    it('should throw when LLM returns no JSON', async () => {
      mastraProvider.getMastra.mockReturnValue({
        getAgent: jest.fn().mockReturnValue({
          generate: jest.fn().mockResolvedValue({ text: 'no json' }),
        }),
      });
      await expect(service.generate(1, true)).rejects.toThrow(
        'Failed to generate briefing — AI response was not valid JSON',
      );
    });

    it('should include active alerts in prompt', async () => {
      prisma.alert.findMany
        .mockResolvedValueOnce([
          {
            alertId: 'A-1',
            alertType: 'HOS_VIOLATION',
            priority: 'critical',
            title: 'T',
            message: 'M',
            driverId: 'D-1',
            loadId: null,
            occurrenceCount: 1,
          },
        ])
        .mockResolvedValueOnce([]);
      const result = await service.generate(1, true);
      expect(result).toBeDefined();
    });
  });
});
