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

import { ComplianceAgent } from '../compliance.agent';

describe('ComplianceAgent', () => {
  let agent: ComplianceAgent;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      driver: {
        count: jest.fn().mockResolvedValue(0),
      },
    };

    agent = new ComplianceAgent(
      { getSkills: jest.fn(), getSkill: jest.fn() } as any,
      { getToolsetsForPersona: jest.fn() } as any,
      { getMastra: jest.fn() } as any,
      { record: jest.fn() } as any,
      mockPrisma,
    );
  });

  it('has correct definition', () => {
    expect(agent.id).toBe('compliance');
    expect(agent.displayName).toBe('Compliance');
    expect(agent.mastraAgentId).toBe('sally-compliance');
    expect(agent.personas).toContain('dispatcher');
  });

  it('has correct task skills', () => {
    expect(agent.taskSkills).toContain('audit-load-compliance');
    expect(agent.taskSkills).toContain('check-driver-quals');
    expect(agent.taskSkills).toContain('shield-investigation');
  });

  describe('getStatus', () => {
    it('returns monitoring when driver docs are expiring soon', async () => {
      mockPrisma.driver.count.mockResolvedValue(2);
      const status = await agent.getStatus(1);
      expect(status.state).toBe('monitoring');
      expect(status.summary).toContain('2');
      expect(status.summary).toContain('expiring');
    });

    it('returns idle when all compliant', async () => {
      mockPrisma.driver.count.mockResolvedValue(0);
      const status = await agent.getStatus(1);
      expect(status.state).toBe('idle');
      expect(status.summary).toBe('All compliant');
    });
  });
});
