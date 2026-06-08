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

import { DriverAgent } from '../driver.agent';
import { ToolNames } from '../../agent-contract/tool-names.constants';

describe('DriverAgent', () => {
  let agent: DriverAgent;
  let mockModuleRef: any;

  beforeEach(() => {
    mockModuleRef = {
      get: jest.fn(),
    };

    agent = new DriverAgent(
      { getSkills: jest.fn(), getSkill: jest.fn() } as any,
      { getToolsetsForPersona: jest.fn() } as any,
      { getMastra: jest.fn() } as any,
      { record: jest.fn() } as any,
      mockModuleRef,
    );
  });

  it('has correct definition', () => {
    expect(agent.id).toBe('driver');
    expect(agent.displayName).toBe('Driver');
    expect(agent.personas).toContain('driver');
    expect(agent.definition.maxToolSteps).toBe(6);
  });

  it('has correct mastra agent id', () => {
    expect(agent.mastraAgentId).toBe('sally-driver');
  });

  it('has correct domain skills', () => {
    expect(agent.domainSkills).toContain('driver-daily-ops');
  });

  it('has correct task skills', () => {
    expect(agent.taskSkills).toContain(ToolNames.REPORT_ARRIVAL);
    expect(agent.taskSkills).toContain(ToolNames.REPORT_ISSUE);
    expect(agent.taskSkills).toContain('emergency-escalation');
  });

  describe('chat emergency detection', () => {
    it('should detect "accident" as emergency', async () => {
      const mockSafetyAgent = {
        chat: jest.fn().mockReturnValue(
          (async function* () {
            yield { type: 'text-delta', data: 'Emergency response' };
          })(),
        ),
      };
      const mockRegistry = {
        get: jest.fn().mockReturnValue(mockSafetyAgent),
      };
      mockModuleRef.get.mockReturnValue(mockRegistry);

      const ctx = {
        tenantId: 1,
        userId: 'user_1',
        userMode: 'driver',
        conversationId: 'conv_1',
      } as any;

      const chunks: any[] = [];
      for await (const chunk of agent.chat('There was an accident on I-35', ctx)) {
        chunks.push(chunk);
      }

      expect(mockRegistry.get).toHaveBeenCalledWith('safety');
      expect(mockSafetyAgent.chat).toHaveBeenCalled();
    });

    it('should detect "fire" as emergency', async () => {
      const mockSafetyAgent = {
        chat: jest.fn().mockReturnValue(
          (async function* () {
            yield { type: 'text-delta', data: 'Fire response' };
          })(),
        ),
      };
      mockModuleRef.get.mockReturnValue({
        get: jest.fn().mockReturnValue(mockSafetyAgent),
      });

      const ctx = {
        tenantId: 1,
        userId: 'user_1',
        userMode: 'driver',
        conversationId: 'conv_1',
      } as any;

      const chunks: any[] = [];
      for await (const chunk of agent.chat('fire in the engine!', ctx)) {
        chunks.push(chunk);
      }
      expect(chunks.length).toBeGreaterThan(0);
    });
  });
});
