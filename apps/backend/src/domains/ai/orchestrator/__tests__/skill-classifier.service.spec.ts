jest.mock('ai', () => ({
  ...jest.requireActual('ai'),
  generateText: jest.fn(),
}));
jest.mock('../../../prompting', () => ({
  PromptingService: jest.fn(),
  PROMPT_NAMES: { SKILL_CLASSIFIER: 'assistant-skill-classifier' },
}));

import { SkillClassifierService } from '../skill-classifier.service';
import { generateText } from 'ai';
import type { PromptingService } from '../../../prompting';
import { makeResolver } from '../../routing/__tests__/resolver-fixtures';

const TENANT = 7;
const OPENROUTER = { openRouterApiKey: 'sk-or-test' };

const mockGenerateText = generateText as jest.Mock;

describe('SkillClassifierService', () => {
  let service: SkillClassifierService;
  let promptService: jest.Mocked<PromptingService>;

  beforeEach(() => {
    promptService = {
      getPrompt: jest.fn().mockResolvedValue('You route user messages to agents.'),
    } as unknown as jest.Mocked<PromptingService>;
    service = new SkillClassifierService(promptService, makeResolver({ config: OPENROUTER }).resolver);
    mockGenerateText.mockReset();
  });

  it("classifies on the tenant's route, with the fast alias", async () => {
    mockGenerateText.mockResolvedValue({ text: '{ "agentId": "assistant", "taskSkill": null }' });

    await service.classify('show me my account', TENANT);

    expect(mockGenerateText.mock.calls[0][0].model).toMatchObject({ modelId: 'anthropic/claude-haiku-5.5' });
  });

  it("never sends a zero-retention tenant's message to a retaining route: no model call, default agent", async () => {
    service = new SkillClassifierService(
      promptService,
      makeResolver({ aiZeroRetention: true, config: OPENROUTER }).resolver,
    );

    const result = await service.classify('my private message', TENANT);

    expect(mockGenerateText).not.toHaveBeenCalled();
    expect(result).toEqual({ agentId: 'assistant', taskSkill: null });
  });

  it('should return a registered agent id', async () => {
    mockGenerateText.mockResolvedValue({
      text: '{ "agentId": "assistant", "taskSkill": null }',
    });
    const result = await service.classify('show me my account', TENANT);
    expect(result.agentId).toBe('assistant');
    expect(result.taskSkill).toBeNull();
  });

  it('leaves room for always-on thinking before the one-line JSON answer', async () => {
    mockGenerateText.mockResolvedValue({ text: '{ "agentId": "assistant", "taskSkill": null }' });

    await service.classify('show me my account', TENANT);

    // Thinking counts toward the output cap on the 5.5 models; 50 tokens could
    // be spent thinking and leave no answer, silently routing to the default.
    expect(mockGenerateText.mock.calls[0][0].maxOutputTokens).toBeGreaterThanOrEqual(1024);
  });

  it('logs an empty answer as its own warning before defaulting to assistant', async () => {
    mockGenerateText.mockResolvedValue({ text: '', finishReason: 'length' });
    const warn = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);

    const result = await service.classify('show me my account', TENANT);

    expect(result.agentId).toBe('assistant');
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/empty answer/i));
  });

  it('should handle JSON wrapped in markdown fences', async () => {
    mockGenerateText.mockResolvedValue({
      text: '```json\n{ "agentId": "assistant", "taskSkill": null }\n```',
    });
    const result = await service.classify('help me', TENANT);
    expect(result.agentId).toBe('assistant');
  });

  it('should fall back to assistant for unregistered agent IDs', async () => {
    mockGenerateText.mockResolvedValue({
      text: '{ "agentId": "unknown_agent", "taskSkill": null }',
    });
    const result = await service.classify('hello', TENANT);
    expect(result.agentId).toBe('assistant');
  });

  it('should default to assistant on parse error', async () => {
    mockGenerateText.mockResolvedValue({
      text: 'not valid json',
    });
    const result = await service.classify('hello', TENANT);
    expect(result.agentId).toBe('assistant');
    expect(result.taskSkill).toBeNull();
  });

  it('should default to assistant on network error', async () => {
    mockGenerateText.mockRejectedValue(new Error('Network error'));
    const result = await service.classify('hello', TENANT);
    expect(result.agentId).toBe('assistant');
    expect(result.taskSkill).toBeNull();
  });

  it('should pass taskSkill from response', async () => {
    mockGenerateText.mockResolvedValue({
      text: '{ "agentId": "assistant", "taskSkill": "example-skill" }',
    });
    const result = await service.classify('run the example task', TENANT);
    expect(result.agentId).toBe('assistant');
    expect(result.taskSkill).toBe('example-skill');
  });
});
