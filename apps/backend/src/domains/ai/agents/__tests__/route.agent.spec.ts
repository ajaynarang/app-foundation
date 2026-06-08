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

import { RouteAgent } from '../route.agent';

describe('RouteAgent', () => {
  let agent: RouteAgent;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      load: {
        count: jest.fn().mockResolvedValue(0),
      },
    };

    agent = new RouteAgent(
      { getSkills: jest.fn(), getSkill: jest.fn() } as any,
      { getToolsetsForPersona: jest.fn() } as any,
      { getMastra: jest.fn() } as any,
      { record: jest.fn() } as any,
      mockPrisma,
    );
  });

  it('has correct definition', () => {
    expect(agent.id).toBe('route');
    expect(agent.displayName).toBe('Route');
    expect(agent.mastraAgentId).toBe('sally-route');
    expect(agent.personas).toContain('dispatcher');
  });

  it('has correct task skills', () => {
    expect(agent.taskSkills).toContain('plan-new-route');
    expect(agent.taskSkills).toContain('reroute-active');
    expect(agent.taskSkills).toContain('optimize-fuel-stops');
  });

  describe('getStatus', () => {
    it('returns monitoring when loads are in transit', async () => {
      mockPrisma.load.count.mockResolvedValue(3);
      const status = await agent.getStatus(1);
      expect(status.state).toBe('monitoring');
      expect(status.summary).toContain('3');
      expect(status.summary).toContain('active routes');
    });

    it('returns idle when no active routes', async () => {
      mockPrisma.load.count.mockResolvedValue(0);
      const status = await agent.getStatus(1);
      expect(status.state).toBe('idle');
      expect(status.summary).toBe('No active routes');
    });
  });
});
