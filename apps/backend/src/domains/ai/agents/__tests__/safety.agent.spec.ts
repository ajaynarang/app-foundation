jest.mock('@mastra/core', () => ({}));
jest.mock('@mastra/core/agent', () => ({}));
jest.mock('@mastra/core/tools', () => ({ createTool: jest.fn() }));
jest.mock('@mastra/pg', () => ({ PostgresStore: jest.fn() }));
jest.mock('@mastra/memory', () => ({ Memory: jest.fn() }));
jest.mock('@mastra/observability', () => ({ Observability: jest.fn() }));
jest.mock('@mastra/langfuse', () => ({ LangfuseExporter: jest.fn() }));
jest.mock('ai', () => ({
  jsonSchema: jest.fn(),
  customProvider: jest.fn(),
  createGateway: jest.fn(),
}));
jest.mock('@ai-sdk/anthropic', () => ({ createAnthropic: jest.fn() }));
jest.mock('zod-to-json-schema', () => ({ zodToJsonSchema: jest.fn() }));
jest.mock('@rekog/mcp-nest', () => ({
  McpRegistryService: jest.fn(),
  Tool: () => () => {},
}));
jest.mock('langfuse', () => ({ Langfuse: jest.fn() }));

import { SafetyAgent } from '../safety.agent';

describe('SafetyAgent', () => {
  let agent: SafetyAgent;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      alert: {
        count: jest.fn().mockResolvedValue(0),
      },
    };

    agent = new SafetyAgent(
      { getSkills: jest.fn(), getSkill: jest.fn() } as any,
      { getToolsetsForPersona: jest.fn() } as any,
      { getMastra: jest.fn() } as any,
      { record: jest.fn() } as any,
      mockPrisma,
    );
  });

  it('has correct definition', () => {
    expect(agent.id).toBe('safety');
    expect(agent.displayName).toBe('Safety');
    expect(agent.mastraAgentId).toBe('sally-safety');
    expect(agent.personas).toContain('dispatcher');
    expect(agent.personas).toContain('driver');
  });

  it('has correct task skills', () => {
    expect(agent.taskSkills).toContain('handle-accident');
    expect(agent.taskSkills).toContain('file-cargo-claim');
    expect(agent.taskSkills).toContain('review-csa-score');
    expect(agent.taskSkills).toContain('post-accident-protocol');
  });

  describe('getStatus', () => {
    it('returns monitoring when open incidents exist', async () => {
      mockPrisma.alert.count.mockResolvedValue(4);
      const status = await agent.getStatus(1);
      expect(status.state).toBe('monitoring');
      expect(status.summary).toContain('4');
      expect(status.summary).toContain('open incidents');
    });

    it('returns idle when no open incidents', async () => {
      mockPrisma.alert.count.mockResolvedValue(0);
      const status = await agent.getStatus(1);
      expect(status.state).toBe('idle');
      expect(status.summary).toBe('No open incidents');
    });
  });
});
