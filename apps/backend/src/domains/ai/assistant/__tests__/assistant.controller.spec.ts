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
jest.mock('@presidio-dev/hai-guardrails', () => ({}));
jest.mock('redact-pii', () => ({}));

import { AssistantAiController } from '../assistant.controller';

describe('AssistantAiController', () => {
  let controller: AssistantAiController;
  let mockService: any;
  let mockAgentRegistry: any;

  beforeEach(() => {
    mockService = {
      createConversation: jest.fn().mockResolvedValue({
        conversationId: 'conv_1',
        userMode: 'owner',
        greeting: { messageId: 'msg_1', role: 'assistant', content: 'Hi' },
      }),
      streamMessage: jest.fn().mockResolvedValue(undefined),
      listConversations: jest.fn().mockResolvedValue({
        conversations: [],
      }),
      resumeAgent: jest.fn().mockResolvedValue(undefined),
      getMessages: jest.fn().mockResolvedValue({
        conversationId: 'conv_1',
        messages: [],
      }),
    };

    mockAgentRegistry = {
      getForPersona: jest.fn().mockReturnValue([
        {
          id: 'assistant',
          displayName: 'Assistant',
          getStatus: jest.fn().mockResolvedValue({ state: 'idle', summary: 'Ready' }),
        },
      ]),
    };

    controller = new AssistantAiController(mockService, mockAgentRegistry);
  });

  describe('createConversation', () => {
    it('delegates to service with user context', async () => {
      const user = { userId: 'user_1', tenantDbId: 1 };
      await controller.createConversation(user, { userMode: 'owner' });
      expect(mockService.createConversation).toHaveBeenCalledWith('user_1', 1, 'owner');
    });
  });

  describe('sendMessage', () => {
    it('delegates to service.streamMessage', async () => {
      const user = { userId: 'user_1', tenantDbId: 1 };
      const req = {} as any;
      const res = {} as any;
      await controller.sendMessage(user, 'conv_1', { content: 'Hello', inputMode: 'text' }, req, res);
      expect(mockService.streamMessage).toHaveBeenCalledWith('conv_1', 'Hello', 'text', 'user_1', 1, req, res, {
        promptKey: undefined,
        promptVariables: undefined,
      });
    });
  });

  describe('listConversations', () => {
    it('delegates to service with limit', async () => {
      const user = { userId: 'user_1', tenantDbId: 1 };
      await controller.listConversations(user, 20);
      expect(mockService.listConversations).toHaveBeenCalledWith('user_1', 1, 20);
    });
  });

  describe('resumeAgent', () => {
    it('delegates to service.resumeAgent', async () => {
      const user = { userId: 'user_1', tenantDbId: 1 };
      const req = {} as any;
      const res = {} as any;
      await controller.resumeAgent(user, 'conv_1', { confirmed: true, toolCallId: 'tc_1', runId: 'run_1' }, req, res);
      expect(mockService.resumeAgent).toHaveBeenCalledWith('conv_1', true, 'tc_1', 'run_1', 'user_1', 1, req, res);
    });
  });

  describe('getMessages', () => {
    it('delegates to service.getMessages', async () => {
      const user = { userId: 'user_1', tenantDbId: 1 };
      await controller.getMessages(user, 'conv_1');
      expect(mockService.getMessages).toHaveBeenCalledWith('conv_1', 'user_1', 1);
    });
  });

  describe('getAgentStatuses', () => {
    it('returns status of agents for persona', async () => {
      const user = { userId: 'user_1', tenantDbId: 1, userMode: 'owner' };
      const result = await controller.getAgentStatuses(user);
      expect(result.agents).toHaveLength(1);
      expect(result.agents[0]).toEqual(
        expect.objectContaining({
          id: 'assistant',
          status: { state: 'idle', summary: 'Ready' },
        }),
      );
    });
  });
});
