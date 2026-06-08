jest.mock('../../../../../domains/ai/infrastructure/providers/ai-provider', () => ({
  isAiConfigured: jest.fn().mockReturnValue(true),
}));

jest.mock('../../../../../domains/prompting', () => ({
  PromptingService: jest.fn(),
  PROMPT_NAMES: { SHIELD_ANALYST: 'shield-analyst' },
}));

jest.mock('../../../../../domains/ai/infrastructure/providers/structured-output.service', () => ({
  StructuredOutputService: jest.fn(),
}));

import { Test } from '@nestjs/testing';
import { ShieldAIAnalyst } from '../shield-ai-analyst.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { StructuredOutputService } from '../../../../../domains/ai/infrastructure/providers/structured-output.service';
import { PromptingService } from '../../../../../domains/prompting';
import { isAiConfigured } from '../../../../../domains/ai/infrastructure/providers/ai-provider';

describe('ShieldAIAnalyst', () => {
  let service: ShieldAIAnalyst;
  let prisma: any;
  let structuredOutput: any;

  const mockAIResponse = {
    summary: 'Fleet is compliant.',
    findings: [
      {
        title: 'CDL expiry',
        description: 'Driver CDL expired',
        severity: 'WARNING',
        category: 'DRIVERS',
        recommendation: 'Renew CDL',
        impact: 'Out of compliance',
      },
    ],
    insights: [{ title: 'Cross check', description: 'Good patterns' }],
    priorityActions: [{ priority: 1, action: 'Renew CDLs' }],
    skippedRules: [],
  };

  beforeEach(async () => {
    prisma = {
      driver: { findMany: jest.fn().mockResolvedValue([]) },
      vehicle: { findMany: jest.fn().mockResolvedValue([]) },
      load: { findMany: jest.fn().mockResolvedValue([]) },
      shieldAudit: { findMany: jest.fn().mockResolvedValue([]) },
    };
    structuredOutput = {
      extract: jest.fn().mockResolvedValue({ object: mockAIResponse }),
    };

    const module = await Test.createTestingModule({
      providers: [
        ShieldAIAnalyst,
        { provide: PrismaService, useValue: prisma },
        { provide: StructuredOutputService, useValue: structuredOutput },
        {
          provide: PromptingService,
          useValue: {
            registerFallback: jest.fn(),
            getPrompt: jest.fn().mockResolvedValue('prompt'),
          },
        },
      ],
    }).compile();

    service = module.get(ShieldAIAnalyst);
  });

  it('should throw if AI not configured', async () => {
    (isAiConfigured as jest.Mock).mockReturnValueOnce(false);
    await expect(service.analyze(1, [], [])).rejects.toThrow(
      'AI analysis is currently unavailable. Please try again later.',
    );
  });

  it('should analyze with fast model and return response', async () => {
    const result = await service.analyze(1, [], []);
    expect(result.response.summary).toBe('Fleet is compliant.');
    expect(result.modelUsed).toBe('haiku-4.5');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should fall back to standard model on fast model failure', async () => {
    structuredOutput.extract
      .mockRejectedValueOnce(new Error('Fast model failed'))
      .mockResolvedValueOnce({ object: mockAIResponse });
    const result = await service.analyze(1, [], []);
    expect(result.modelUsed).toBe('sonnet-4.5');
    expect(structuredOutput.extract).toHaveBeenCalledTimes(2);
  });

  it('should throw when both models fail', async () => {
    structuredOutput.extract
      .mockRejectedValueOnce(new Error('Fast fail'))
      .mockRejectedValueOnce(new Error('Standard fail'));
    await expect(service.analyze(1, [], [])).rejects.toThrow('Standard fail');
  });

  it('should throw when fast model returns no object', async () => {
    structuredOutput.extract.mockResolvedValueOnce({ object: null });
    // Falls through to standard
    structuredOutput.extract.mockResolvedValueOnce({ object: mockAIResponse });
    const result = await service.analyze(1, [], []);
    expect(result.modelUsed).toBe('sonnet-4.5');
  });

  it('should include custom rules in prompt', async () => {
    await service.analyze(1, [], ['All drivers must have fire extinguisher']);
    const extractCall = structuredOutput.extract.mock.calls[0][0];
    expect(extractCall.messages[0].content).toContain('fire extinguisher');
  });

  it('should include rule findings context', async () => {
    await service.analyze(
      1,
      [
        {
          severity: 'WARNING',
          category: 'HOS',
          title: 'Test',
          description: 'desc',
        },
      ],
      [],
    );
    const extractCall = structuredOutput.extract.mock.calls[0][0];
    expect(extractCall.messages[0].content).toContain('Test');
  });

  it('should handle custom audit period', async () => {
    await service.analyze(1, [], [], 7);
    expect(prisma.driver.findMany).toHaveBeenCalled();
  });
});
