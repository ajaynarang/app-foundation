jest.mock('ai', () => ({
  generateText: jest.fn(),
}));
jest.mock('../../infrastructure/providers/ai-provider', () => ({
  ai: jest.fn().mockReturnValue('mock-model'),
}));
jest.mock('../../../../domains/prompting', () => ({
  PromptingService: jest.fn(),
  PROMPT_NAMES: { SKILL_CLASSIFIER: 'assistant-skill-classifier' },
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
      getPrompt: jest.fn().mockResolvedValue('You route user messages to agents.'),
    } as unknown as jest.Mocked<PromptingService>;
    service = new SkillClassifierService(promptService);
    mockGenerateText.mockReset();
  });

  it('should return a registered agent id', async () => {
    mockGenerateText.mockResolvedValue({
      text: '{ "agentId": "assistant", "taskSkill": null }',
    });
    const result = await service.classify('show me my account');
    expect(result.agentId).toBe('assistant');
    expect(result.taskSkill).toBeNull();
  });

  it('should handle JSON wrapped in markdown fences', async () => {
    mockGenerateText.mockResolvedValue({
      text: '```json\n{ "agentId": "assistant", "taskSkill": null }\n```',
    });
    const result = await service.classify('help me');
    expect(result.agentId).toBe('assistant');
  });

  it('should fall back to assistant for unregistered agent IDs', async () => {
    mockGenerateText.mockResolvedValue({
      text: '{ "agentId": "unknown_agent", "taskSkill": null }',
    });
    const result = await service.classify('hello');
    expect(result.agentId).toBe('assistant');
  });

  it('should default to assistant on parse error', async () => {
    mockGenerateText.mockResolvedValue({
      text: 'not valid json',
    });
    const result = await service.classify('hello');
    expect(result.agentId).toBe('assistant');
    expect(result.taskSkill).toBeNull();
  });

  it('should default to assistant on network error', async () => {
    mockGenerateText.mockRejectedValue(new Error('Network error'));
    const result = await service.classify('hello');
    expect(result.agentId).toBe('assistant');
    expect(result.taskSkill).toBeNull();
  });

  it('should pass taskSkill from response', async () => {
    mockGenerateText.mockResolvedValue({
      text: '{ "agentId": "assistant", "taskSkill": "example-skill" }',
    });
    const result = await service.classify('run the example task');
    expect(result.agentId).toBe('assistant');
    expect(result.taskSkill).toBe('example-skill');
  });
});
