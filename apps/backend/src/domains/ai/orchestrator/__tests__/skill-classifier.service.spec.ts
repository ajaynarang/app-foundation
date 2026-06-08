jest.mock('ai', () => ({
  generateText: jest.fn(),
}));
jest.mock('../../infrastructure/providers/ai-provider', () => ({
  ai: jest.fn().mockReturnValue('mock-model'),
}));
jest.mock('../../../../domains/prompting', () => ({
  PromptingService: jest.fn(),
  PROMPT_NAMES: { SKILL_CLASSIFIER: 'sally-skill-classifier' },
}));

import { SkillClassifierService } from '../skill-classifier.service';
import { generateText } from 'ai';
import type { PromptingService } from '../../../../domains/prompting';

const mockGenerateText = generateText as jest.Mock;

describe('SkillClassifierService', () => {
  let service: SkillClassifierService;
  let promptService: jest.Mocked<PromptingService>;

  beforeEach(() => {
    promptService = {
      getPrompt: jest.fn().mockResolvedValue('You route fleet operations messages.'),
    } as unknown as jest.Mocked<PromptingService>;
    service = new SkillClassifierService(promptService);
    mockGenerateText.mockReset();
  });

  it('should classify a billing message', async () => {
    mockGenerateText.mockResolvedValue({
      text: '{ "agentId": "billing", "taskSkill": null }',
    });
    const result = await service.classify('show me unpaid invoices');
    expect(result.agentId).toBe('billing');
    expect(result.taskSkill).toBeNull();
  });

  it('should handle JSON wrapped in markdown fences', async () => {
    mockGenerateText.mockResolvedValue({
      text: '```json\n{ "agentId": "route", "taskSkill": null }\n```',
    });
    const result = await service.classify('plan a route');
    expect(result.agentId).toBe('route');
  });

  it('should default to dispatch for unknown agent IDs', async () => {
    mockGenerateText.mockResolvedValue({
      text: '{ "agentId": "unknown_agent", "taskSkill": null }',
    });
    const result = await service.classify('hello');
    expect(result.agentId).toBe('dispatch');
  });

  it('should default to dispatch on parse error', async () => {
    mockGenerateText.mockResolvedValue({
      text: 'not valid json',
    });
    const result = await service.classify('hello');
    expect(result.agentId).toBe('dispatch');
    expect(result.taskSkill).toBeNull();
  });

  it('should default to dispatch on network error', async () => {
    mockGenerateText.mockRejectedValue(new Error('Network error'));
    const result = await service.classify('hello');
    expect(result.agentId).toBe('dispatch');
    expect(result.taskSkill).toBeNull();
  });

  it('should pass taskSkill from response', async () => {
    mockGenerateText.mockResolvedValue({
      text: '{ "agentId": "compliance", "taskSkill": "shield-audit" }',
    });
    const result = await service.classify('run compliance audit');
    expect(result.agentId).toBe('compliance');
    expect(result.taskSkill).toBe('shield-audit');
  });
});
