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

import { DispatchAgent } from '../dispatch.agent';

describe('DispatchAgent', () => {
  let agent: DispatchAgent;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      load: {
        count: jest.fn().mockResolvedValue(0),
      },
    };

    agent = new DispatchAgent(
      { getSkills: jest.fn(), getSkill: jest.fn() } as any,
      { getToolsetsForPersona: jest.fn() } as any,
      { getMastra: jest.fn() } as any,
      { record: jest.fn() } as any,
      mockPrisma,
    );
  });

  it('has correct definition', () => {
    expect(agent.id).toBe('dispatch');
    expect(agent.displayName).toBe('Dispatch');
    expect(agent.personas).toContain('dispatcher');
  });

  describe('getStatus', () => {
    it('returns monitoring when loads in transit', async () => {
      mockPrisma.load.count.mockResolvedValue(5);
      const status = await agent.getStatus(1);
      expect(status.state).toBe('monitoring');
      expect(status.summary).toContain('5');
    });

    it('returns idle when no loads in transit', async () => {
      mockPrisma.load.count.mockResolvedValue(0);
      const status = await agent.getStatus(1);
      expect(status.state).toBe('idle');
    });
  });
});
