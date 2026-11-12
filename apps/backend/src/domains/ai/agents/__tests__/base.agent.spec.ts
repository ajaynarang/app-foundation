jest.mock('@mastra/core', () => ({}));
jest.mock('@mastra/core/agent', () => ({}));
jest.mock('@mastra/core/tools', () => ({ createTool: jest.fn() }));
jest.mock('@mastra/pg', () => ({ PostgresStore: jest.fn() }));
jest.mock('@mastra/memory', () => ({ Memory: jest.fn() }));
jest.mock('@mastra/observability', () => ({ Observability: jest.fn() }));
jest.mock('@mastra/langfuse', () => ({ LangfuseExporter: jest.fn() }));
jest.mock('ai', () => ({
  ...jest.requireActual('ai'),
  jsonSchema: jest.fn(),
  customProvider: jest.fn(),
  createGateway: jest.fn(),
}));
jest.mock('@ai-sdk/anthropic', () => ({ createAnthropic: jest.fn() }));
jest.mock('zod-to-json-schema', () => ({ zodToJsonSchema: jest.fn() }));
jest.mock('@rekog/mcp-nest', () => ({
  McpRegistryDiscoveryService: jest.fn(),
  Tool: () => () => {},
}));
jest.mock('langfuse', () => ({ Langfuse: jest.fn() }));

import { AbstractBaseAgent, CHAT_STEP_MAX_OUTPUT_TOKENS } from '../base.agent';
import { AgentContext, AgentDefinition } from '../agent.types';
import { REQUEST_MODEL_KEY } from '../../routing/request-model-key';
import { makeResolver } from '../../routing/__tests__/resolver-fixtures';
import { ZeroRetentionUnavailable } from '../../infrastructure/redaction/zero-retention-unavailable.error';

const OPENROUTER = { openRouterApiKey: 'sk-or-test' };
const CTX: AgentContext = {
  userMode: 'member',
  tenantId: 1,
  userId: 'user_1',
  userDbId: 1,
  conversationId: 'conv_1',
  inputMode: 'text',
};

/** A Mastra agent whose stream yields `parts` and reports `usage` once drained. */
function streamingAgent(parts: string[], usage: Record<string, number> = {}) {
  const read = jest.fn();
  for (const value of parts) read.mockResolvedValueOnce({ done: false, value });
  read.mockResolvedValueOnce({ done: true, value: undefined });
  return {
    getInstructions: jest.fn().mockResolvedValue('Base instructions'),
    stream: jest.fn().mockResolvedValue({
      textStream: { getReader: () => ({ read, releaseLock: jest.fn() }) },
      suspendPayload: undefined,
      usage: Promise.resolve(usage),
    }),
  };
}

class TestAgent extends AbstractBaseAgent {
  readonly definition: AgentDefinition = {
    id: 'assistant',
    displayName: 'Assistant',
    mastraAgentId: 'assistant',
    modelAlias: 'standard',
    domainSkills: [],
    taskSkills: [],
    personas: ['member', 'admin'],
    maxToolSteps: 10,
  };
}

describe('AbstractBaseAgent', () => {
  let agent: TestAgent;
  let mockSkillLoader: any;
  let mockMcpToolService: any;
  let mockMastraProvider: any;
  let mockAiTelemetry: any;

  beforeEach(() => {
    mockSkillLoader = {
      getSkills: jest.fn().mockResolvedValue('domain knowledge'),
      getSkill: jest.fn().mockResolvedValue('skill content'),
    };
    mockMcpToolService = {
      getToolsetsForPersona: jest.fn().mockResolvedValue({ 'app-tools': {} }),
    };
    mockMastraProvider = {
      getMastra: jest.fn(),
    };
    mockAiTelemetry = {
      record: jest.fn().mockResolvedValue({ id: 'inv-chat' }),
    };

    agent = new TestAgent(
      mockSkillLoader,
      mockMcpToolService,
      mockMastraProvider,
      mockAiTelemetry,
      makeResolver({ config: OPENROUTER }).resolver,
    );
  });

  describe('routing', () => {
    it("hands the agent the tenant's resolved model for its alias through the request context", async () => {
      const mockAgent = streamingAgent(['hi']);
      mockMastraProvider.getMastra.mockReturnValue({ getAgent: jest.fn().mockReturnValue(mockAgent) });

      for await (const _chunk of agent.chat('Test message', CTX)) {
        // drain
      }

      const requestContext = mockAgent.stream.mock.calls[0][1].requestContext;
      expect(requestContext.get(REQUEST_MODEL_KEY)).toMatchObject({ modelId: 'anthropic/claude-sonnet-5.5' });
    });

    it('records the turn against the route that served it', async () => {
      const mockAgent = streamingAgent(['hi'], { inputTokens: 12, outputTokens: 3 });
      mockMastraProvider.getMastra.mockReturnValue({ getAgent: jest.fn().mockReturnValue(mockAgent) });

      for await (const _chunk of agent.chat('Test message', CTX)) {
        // drain
      }
      await new Promise((r) => setImmediate(r));

      expect(mockAiTelemetry.record).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'openrouter',
          model: 'anthropic/claude-sonnet-5.5',
          routeId: 'platform-openrouter',
          credentialType: 'PLATFORM_OPENROUTER',
          promptTokens: 12,
          completionTokens: 3,
        }),
        expect.objectContaining({ tenantId: 1, surface: 'CHAT' }),
      );
    });

    it('refuses a zero-retention tenant before anything streams: the message never reaches a retaining route', async () => {
      agent = new TestAgent(
        mockSkillLoader,
        mockMcpToolService,
        mockMastraProvider,
        mockAiTelemetry,
        makeResolver({ aiZeroRetention: true, config: OPENROUTER }).resolver,
      );
      const mockAgent = streamingAgent(['hi']);
      mockMastraProvider.getMastra.mockReturnValue({ getAgent: jest.fn().mockReturnValue(mockAgent) });

      await expect(agent.chat('Private message', CTX).next()).rejects.toThrow(ZeroRetentionUnavailable);
      expect(mockAgent.stream).not.toHaveBeenCalled();
      expect(mockAiTelemetry.record).not.toHaveBeenCalled();
    });

    it("hands a delegated execute the tenant's resolved model too", async () => {
      const mockAgent = { generate: jest.fn().mockResolvedValue({ text: 'ok' }) };
      mockMastraProvider.getMastra.mockReturnValue({ getAgent: jest.fn().mockReturnValue(mockAgent) });

      await agent.execute('summarize', {}, CTX);

      const requestContext = mockAgent.generate.mock.calls[0][1].requestContext;
      expect(requestContext.get(REQUEST_MODEL_KEY)).toMatchObject({ modelId: 'anthropic/claude-sonnet-5.5' });
    });
  });

  it('exposes definition properties', () => {
    expect(agent.id).toBe('assistant');
    expect(agent.displayName).toBe('Assistant');
    expect(agent.mastraAgentId).toBe('assistant');
    expect(agent.domainSkills).toEqual([]);
    expect(agent.taskSkills).toEqual([]);
    expect(agent.personas).toEqual(['member', 'admin']);
  });

  describe('chat', () => {
    it('streams text-delta chunks from mastra agent', async () => {
      const mockReader = {
        read: jest
          .fn()
          .mockResolvedValueOnce({ done: false, value: 'Hello' })
          .mockResolvedValueOnce({ done: false, value: ' world' })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: jest.fn(),
      };

      const mockAgent = {
        getInstructions: jest.fn().mockResolvedValue('Base instructions'),
        stream: jest.fn().mockResolvedValue({
          textStream: { getReader: () => mockReader },
          suspendPayload: undefined,
        }),
      };

      mockMastraProvider.getMastra.mockReturnValue({
        getAgent: jest.fn().mockReturnValue(mockAgent),
      });

      const chunks: any[] = [];
      const gen = agent.chat('Test message', {
        userMode: 'member',
        tenantId: 1,
        userId: 'user_1',
        userDbId: 1,
        conversationId: 'conv_1',
        inputMode: 'text',
      });

      for await (const chunk of gen) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(
        expect.arrayContaining([
          { type: 'text-delta', data: 'Hello' },
          { type: 'text-delta', data: ' world' },
        ]),
      );
      expect(mockReader.releaseLock).toHaveBeenCalled();
      // Every step of the chat stream names its output ceiling, never the provider's whole window.
      expect(CHAT_STEP_MAX_OUTPUT_TOKENS).toBeGreaterThanOrEqual(1024);
      expect(mockAgent.stream.mock.calls[0][1].modelSettings).toEqual({
        maxOutputTokens: CHAT_STEP_MAX_OUTPUT_TOKENS,
      });
    });

    it('yields card when card accumulator has data', async () => {
      const mockReader = {
        read: jest.fn().mockResolvedValueOnce({ done: true }),
        releaseLock: jest.fn(),
      };

      const mockAgent = {
        getInstructions: jest.fn().mockResolvedValue('instructions'),
        stream: jest.fn().mockResolvedValue({
          textStream: { getReader: () => mockReader },
          suspendPayload: undefined,
        }),
      };

      mockMastraProvider.getMastra.mockReturnValue({
        getAgent: jest.fn().mockReturnValue(mockAgent),
      });

      // Simulate card capture during tool execution
      mockMcpToolService.getToolsetsForPersona.mockImplementation((_mode: string, _ctx: any, accumulator: any) => {
        if (accumulator) accumulator.capture({ type: 'records', data: {} });
        return { 'app-tools': {} };
      });

      const chunks: any[] = [];
      for await (const chunk of agent.chat('test', {
        userMode: 'member',
        tenantId: 1,
        userId: 'user_1',
        userDbId: 1,
        conversationId: 'conv_1',
        inputMode: 'text',
      })) {
        chunks.push(chunk);
      }

      expect(chunks.some((c) => c.type === 'card')).toBe(true);
    });

    it('yields suspend when agent has suspendPayload', async () => {
      const mockReader = {
        read: jest.fn().mockResolvedValueOnce({ done: true }),
        releaseLock: jest.fn(),
      };

      const mockAgent = {
        getInstructions: jest.fn().mockResolvedValue('instructions'),
        stream: jest.fn().mockResolvedValue({
          textStream: { getReader: () => mockReader },
          suspendPayload: { action: 'confirm', entityId: 'alert_1' },
          runId: 'run_123',
        }),
      };

      mockMastraProvider.getMastra.mockReturnValue({
        getAgent: jest.fn().mockReturnValue(mockAgent),
      });

      const chunks: any[] = [];
      for await (const chunk of agent.chat('ack alert', {
        userMode: 'member',
        tenantId: 1,
        userId: 'user_1',
        userDbId: 1,
        conversationId: 'conv_1',
        inputMode: 'text',
      })) {
        chunks.push(chunk);
      }

      expect(chunks.some((c) => c.type === 'suspend')).toBe(true);
      const suspendChunk = chunks.find((c) => c.type === 'suspend');
      const payload = JSON.parse(suspendChunk.data);
      expect(payload.runId).toBe('run_123');
    });

    it('injects voice instructions when inputMode is voice', async () => {
      const mockReader = {
        read: jest.fn().mockResolvedValueOnce({ done: true }),
        releaseLock: jest.fn(),
      };

      const mockAgent = {
        getInstructions: jest.fn().mockResolvedValue('instructions'),
        stream: jest.fn().mockResolvedValue({
          textStream: { getReader: () => mockReader },
        }),
      };

      mockMastraProvider.getMastra.mockReturnValue({
        getAgent: jest.fn().mockReturnValue(mockAgent),
      });

      const gen = agent.chat('test', {
        userMode: 'member',
        tenantId: 1,
        userId: 'user_1',
        userDbId: 1,
        conversationId: 'conv_1',
        inputMode: 'voice',
        voiceInstructions: 'Speak concisely',
      });
      for await (const _ of gen) {
        // consume
      }

      const streamCall = mockAgent.stream.mock.calls[0];
      expect(streamCall[1].instructions).toContain('Speak concisely');
    });
  });

  describe('execute', () => {
    it('delegates to mastra agent.generate', async () => {
      const mockAgent = {
        generate: jest.fn().mockResolvedValue({ text: 'Result text' }),
      };

      mockMastraProvider.getMastra.mockReturnValue({
        getAgent: jest.fn().mockReturnValue(mockAgent),
      });

      const result = await agent.execute(
        'assign-load',
        { loadId: 'ld_1' },
        {
          userMode: 'member',
          tenantId: 1,
          userId: 'user_1',
          userDbId: 1,
          conversationId: 'conv_1',
          inputMode: 'text',
        },
      );

      expect(result.text).toBe('Result text');
      expect(mockAgent.generate).toHaveBeenCalled();
      expect(mockAgent.generate.mock.calls[0][1].modelSettings).toEqual({
        maxOutputTokens: CHAT_STEP_MAX_OUTPUT_TOKENS,
      });
    });
  });

  describe('getStatus', () => {
    it('returns idle status by default', async () => {
      const status = await agent.getStatus(1);
      expect(status).toEqual({ state: 'idle', summary: 'Ready' });
    });
  });
});
