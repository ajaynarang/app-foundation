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

import { PayrollAgent } from '../payroll.agent';

describe('PayrollAgent', () => {
  let agent: PayrollAgent;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      settlement: {
        count: jest.fn().mockResolvedValue(0),
      },
    };

    agent = new PayrollAgent(
      { getSkills: jest.fn(), getSkill: jest.fn() } as any,
      { getToolsetsForPersona: jest.fn() } as any,
      { getMastra: jest.fn() } as any,
      { record: jest.fn() } as any,
      mockPrisma,
    );
  });

  it('has correct definition', () => {
    expect(agent.id).toBe('payroll');
    expect(agent.displayName).toBe('Payroll');
    expect(agent.mastraAgentId).toBe('sally-payroll');
    expect(agent.personas).toContain('dispatcher');
  });

  it('has correct task skills', () => {
    expect(agent.taskSkills).toContain('run-settlement-cycle');
    expect(agent.taskSkills).toContain('calculate-driver-pay');
    expect(agent.taskSkills).toContain('handle-pay-dispute');
  });

  describe('getStatus', () => {
    it('returns monitoring when draft settlements exist', async () => {
      mockPrisma.settlement.count.mockResolvedValue(5);
      const status = await agent.getStatus(1);
      expect(status.state).toBe('monitoring');
      expect(status.summary).toContain('5');
      expect(status.summary).toContain('settlements pending');
    });

    it('returns idle when all settled', async () => {
      mockPrisma.settlement.count.mockResolvedValue(0);
      const status = await agent.getStatus(1);
      expect(status.state).toBe('idle');
      expect(status.summary).toBe('All settled');
    });
  });
});
