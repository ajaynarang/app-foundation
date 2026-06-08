// Use a filename that's NOT in testPathIgnorePatterns (assistant.service.spec.ts is ignored)
jest.mock('@presidio-dev/hai-guardrails', () => ({}));
jest.mock('redact-pii', () => ({}));
jest.mock('@mastra/pg', () => ({ PostgresStore: jest.fn() }));
jest.mock('@mastra/memory', () => ({ Memory: jest.fn() }));
jest.mock('@mastra/core', () => ({ Mastra: jest.fn() }));
jest.mock('@mastra/core/agent', () => ({ Agent: jest.fn() }));
jest.mock('@mastra/core/tools', () => ({ createTool: jest.fn() }));
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
  McpModule: { forRoot: jest.fn() },
}));
jest.mock('langfuse', () => ({ Langfuse: jest.fn() }));

import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { SallyAiService } from '../assistant.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { McpToolService } from '../../mcp/mcp-tool.service';
import { MastraProvider } from '../mastra/mastra.provider';
import { ModerationService } from '../../moderation/moderation.service';
import { PromptingService } from '../../../../domains/prompting';
import { SallyRouterService } from '../../orchestrator/sally-router.service';
import { AgentRegistry } from '../../agents/agent.registry';
import { AiTelemetryService } from '../../infrastructure/telemetry/ai-telemetry.service';
import { TimezoneService } from '../../../../shared/services/timezone.service';

describe('SallyAiService', () => {
  let service: SallyAiService;
  let mockPrisma: any;
  let mockMcpTools: any;
  let mockMastra: any;
  let mockModeration: any;
  let mockPromptService: any;
  let mockSallyRouter: any;
  let mockAgentRegistry: any;

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 1 }),
      },
      conversation: {
        create: jest.fn().mockResolvedValue({
          id: 1,
          conversationId: 'conv_test',
          userMode: 'dispatcher',
          title: null,
          createdAt: new Date('2026-01-01'),
          messages: [
            {
              messageId: 'msg_test',
              role: 'assistant',
              content: "Hi! I'm SALLY.",
              inputMode: 'text',
              speakText: "Hi! I'm SALLY.",
              createdAt: new Date('2026-01-01'),
            },
          ],
        }),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      conversationMessage: {
        create: jest.fn().mockResolvedValue({ id: 1 }),
      },
    };

    mockMcpTools = {
      getToolsForPersona: jest.fn().mockResolvedValue({}),
      getToolsetsForPersona: jest.fn().mockResolvedValue({ 'sally-tools': {} }),
    };

    mockMastra = {
      getMastra: jest.fn().mockReturnValue({
        getAgent: jest.fn().mockReturnValue({
          stream: jest.fn(),
          resumeStream: jest.fn(),
        }),
      }),
    };

    mockModeration = {
      moderate: jest.fn().mockResolvedValue({ blocked: false, events: [], redactedText: null }),
      redactForAudit: jest.fn((text: string) => Promise.resolve(text)),
    };

    mockPromptService = {
      getPrompt: jest.fn().mockResolvedValue('mocked-system-prompt'),
      registerFallback: jest.fn(),
      isEnabled: false,
    };

    mockSallyRouter = {
      route: jest.fn().mockResolvedValue({
        agentId: 'dispatch',
        taskSkill: null,
        taskSkillContent: null,
        source: 'default',
      }),
      defaultAgentFor: jest.fn().mockReturnValue('dispatch'),
    };

    mockAgentRegistry = {
      get: jest.fn(),
      getForPersona: jest.fn().mockReturnValue([]),
      getAll: jest.fn().mockReturnValue([]),
    };

    service = new SallyAiService(
      mockPrisma as unknown as PrismaService,
      mockMcpTools as unknown as McpToolService,
      mockMastra as unknown as MastraProvider,
      mockModeration as unknown as ModerationService,
      mockPromptService as unknown as PromptingService,
      mockSallyRouter as unknown as SallyRouterService,
      mockAgentRegistry as unknown as AgentRegistry,
      { assertBudget: jest.fn().mockResolvedValue({ state: 'ok' }) } as unknown as AiTelemetryService,
      { resolveTenantTimezone: jest.fn().mockResolvedValue('UTC') } as unknown as TimezoneService,
    );
  });

  describe('createConversation', () => {
    it('creates a conversation and returns greeting', async () => {
      const result = await service.createConversation('user_1', 1, 'dispatcher');
      expect(result.conversationId).toBe('conv_test');
      expect(result.userMode).toBe('dispatcher');
      expect(result.greeting.role).toBe('assistant');
      expect(result.greeting.content).toContain('SALLY');
      expect(mockPrisma.conversation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userMode: 'dispatcher',
            tenantId: 1,
            userId: 1,
          }),
        }),
      );
    });

    it('throws NotFoundException when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.createConversation('user_nonexist', 1, 'dispatcher')).rejects.toThrow(NotFoundException);
    });
  });

  describe('generateResponse', () => {
    beforeEach(() => {
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: 1,
        conversationId: 'conv_test',
        userId: 1,
        tenantId: 1,
        userMode: 'dispatcher',
        title: null,
      });
    });

    it('throws NotFoundException for unknown conversation', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(null);
      const gen = service.generateResponse('conv_unknown', 'hello', 'text', 'user_1', 1);
      await expect(gen.next()).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for wrong tenant', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: 1,
        conversationId: 'conv_test',
        userId: 1,
        tenantId: 99,
        userMode: 'dispatcher',
        title: null,
      });
      const gen = service.generateResponse('conv_test', 'hello', 'text', 'user_1', 1);
      await expect(gen.next()).rejects.toThrow(ForbiddenException);
    });

    it('yields blocked when moderation flags input', async () => {
      mockModeration.moderate.mockResolvedValue({
        blocked: true,
        events: [{ guard: 'content-mod', result: 'block', categories: ['hate'] }],
      });

      const gen = service.generateResponse('conv_test', 'bad content', 'text', 'user_1', 1);

      const result = await gen.next();
      expect(result.value).toEqual(expect.objectContaining({ type: 'blocked' }));

      const done = await gen.next();
      expect(done.done).toBe(true);
    });

    it('stores user message and auto-titles conversation', async () => {
      mockModeration.moderate.mockResolvedValue({
        blocked: true,
        events: [],
      });

      const gen = service.generateResponse('conv_test', 'What loads are active?', 'text', 'user_1', 1);
      await gen.next();

      expect(mockPrisma.conversationMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: 'user',
            content: 'What loads are active?',
          }),
        }),
      );
      expect(mockPrisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'What loads are active?',
          }),
        }),
      );
    });

    it('routes to domain agent and streams response', async () => {
      async function* mockChat() {
        yield { type: 'text-delta' as const, data: 'Hello' };
        yield { type: 'text-delta' as const, data: ' world' };
      }

      mockAgentRegistry.get.mockReturnValue({
        id: 'dispatch',
        chat: jest.fn().mockReturnValue(mockChat()),
      });

      const gen = service.generateResponse('conv_test', 'Show fleet status', 'text', 'user_1', 1);

      const chunks: any[] = [];
      for await (const chunk of gen) {
        chunks.push(chunk);
      }

      expect(mockSallyRouter.route).toHaveBeenCalledWith('Show fleet status', 'dispatcher');
      expect(mockAgentRegistry.get).toHaveBeenCalledWith('dispatch');
      expect(chunks.some((c) => c.type === 'text-delta')).toBe(true);
      expect(chunks.some((c) => c.type === 'complete')).toBe(true);
    });

    it('yields followups when agent response contains them', async () => {
      async function* mockChat() {
        yield {
          type: 'text-delta' as const,
          data: 'Answer.\n\n<followups>\nCheck HOS status\nShow active loads\n</followups>',
        };
      }

      mockAgentRegistry.get.mockReturnValue({
        id: 'dispatch',
        chat: jest.fn().mockReturnValue(mockChat()),
      });

      const gen = service.generateResponse('conv_test', 'hello', 'text', 'user_1', 1);
      const chunks: any[] = [];
      for await (const chunk of gen) {
        chunks.push(chunk);
      }

      expect(chunks.some((c) => c.type === 'followups')).toBe(true);
    });

    it('yields card and suspend chunks', async () => {
      async function* mockChat() {
        yield { type: 'text-delta' as const, data: 'Please confirm' };
        yield {
          type: 'card' as const,
          data: JSON.stringify({ type: 'alert' }),
        };
        yield {
          type: 'suspend' as const,
          data: JSON.stringify({ action: 'ack' }),
        };
      }

      mockAgentRegistry.get.mockReturnValue({
        id: 'dispatch',
        chat: jest.fn().mockReturnValue(mockChat()),
      });

      const gen = service.generateResponse('conv_test', 'ack alert', 'text', 'user_1', 1);
      const chunks: any[] = [];
      for await (const chunk of gen) {
        chunks.push(chunk);
      }

      expect(chunks.some((c) => c.type === 'card')).toBe(true);
      expect(chunks.some((c) => c.type === 'suspend')).toBe(true);
    });

    it('applies output moderation before persisting', async () => {
      mockModeration.moderate
        .mockResolvedValueOnce({ blocked: false, events: [] }) // input
        .mockResolvedValueOnce({ redactedText: 'Redacted' }); // output

      async function* mockChat() {
        yield { type: 'text-delta' as const, data: 'PII text' };
      }

      mockAgentRegistry.get.mockReturnValue({
        id: 'dispatch',
        chat: jest.fn().mockReturnValue(mockChat()),
      });

      const gen = service.generateResponse('conv_test', 'hello', 'text', 'user_1', 1);
      for await (const _ of gen) {
        // consume
      }

      // Output moderation called
      expect(mockModeration.moderate).toHaveBeenCalledWith('PII text', 'output', '');
      // Persisted with redacted text
      const createCalls = mockPrisma.conversationMessage.create.mock.calls;
      const assistantCall = createCalls.find((c: any) => c[0].data.role === 'assistant');
      expect(assistantCall[0].data.content).toBe('Redacted');
    });

    // Previously: a test asserted the blocked-message flow continued when
    // AiAuditService failed. AiAuditService is deleted; no Sally-owned
    // audit write happens on the block path anymore, so the test is moot.

    it('handles output moderation failure gracefully', async () => {
      mockModeration.moderate
        .mockResolvedValueOnce({ blocked: false, events: [] }) // input pass
        .mockRejectedValueOnce(new Error('Output mod failed')); // output fail

      async function* mockChat() {
        yield { type: 'text-delta' as const, data: 'Text' };
      }
      mockAgentRegistry.get.mockReturnValue({
        id: 'dispatch',
        chat: jest.fn().mockReturnValue(mockChat()),
      });

      const gen = service.generateResponse('conv_test', 'hello', 'text', 'user_1', 1);
      const chunks: any[] = [];
      for await (const c of gen) chunks.push(c);
      // Should still complete and store original text
      expect(chunks.some((c) => c.type === 'complete')).toBe(true);
    });

    it('handles message persistence failure gracefully', async () => {
      async function* mockChat() {
        yield { type: 'text-delta' as const, data: 'Text' };
      }
      mockAgentRegistry.get.mockReturnValue({
        id: 'dispatch',
        chat: jest.fn().mockReturnValue(mockChat()),
      });

      // Fail on the second create (assistant message)
      mockPrisma.conversationMessage.create
        .mockResolvedValueOnce({ id: 1 }) // user message
        .mockRejectedValueOnce(new Error('Persist failed')); // assistant message

      const gen = service.generateResponse('conv_test', 'hello', 'text', 'user_1', 1);
      const chunks: any[] = [];
      for await (const c of gen) chunks.push(c);
      // Should still complete despite persistence failure
      expect(chunks.some((c) => c.type === 'complete')).toBe(true);
    });

    it('does not overwrite existing conversation title', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: 1,
        conversationId: 'conv_test',
        userId: 1,
        tenantId: 1,
        userMode: 'dispatcher',
        title: 'Existing Title',
      });

      mockModeration.moderate.mockResolvedValue({
        blocked: true,
        events: [],
      });

      const gen = service.generateResponse('conv_test', 'new message', 'text', 'user_1', 1);
      await gen.next();

      const updateCall = mockPrisma.conversation.update.mock.calls[0][0];
      // When title already exists, should not set it again
      expect(updateCall.data.title).toBeUndefined();
    });

    it('handles moderation failure gracefully (fail-open)', async () => {
      mockModeration.moderate.mockRejectedValue(new Error('Moderation down'));

      async function* mockChat() {
        yield { type: 'text-delta' as const, data: 'Answer' };
      }

      mockAgentRegistry.get.mockReturnValue({
        id: 'dispatch',
        chat: jest.fn().mockReturnValue(mockChat()),
      });

      const gen = service.generateResponse('conv_test', 'hello', 'text', 'user_1', 1);
      const chunks: any[] = [];
      for await (const chunk of gen) {
        chunks.push(chunk);
      }

      // Should still produce response (fail-open)
      expect(chunks.some((c) => c.type === 'complete')).toBe(true);
    });
  });

  describe('streamMessage', () => {
    it('sets streaming headers and calls generateResponse', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: 1,
        conversationId: 'conv_test',
        userId: 1,
        tenantId: 1,
        userMode: 'dispatcher',
        title: null,
      });

      // Block at moderation to keep it simple
      mockModeration.moderate.mockResolvedValue({
        blocked: true,
        events: [],
      });

      const mockReq = { on: jest.fn() } as any;
      const mockRes = {
        setHeader: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        headersSent: false,
      } as any;

      await service.streamMessage('conv_test', 'blocked', 'text', 'user_1', 1, mockReq, mockRes);

      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/plain; charset=utf-8');
      expect(mockRes.end).toHaveBeenCalled();
    });

    it('handles errors during streaming', async () => {
      mockPrisma.user.findUnique.mockRejectedValue(new Error('DB down'));

      const mockReq = { on: jest.fn() } as any;
      const mockRes = {
        setHeader: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        headersSent: false,
      } as any;

      await service.streamMessage('conv_test', 'hello', 'text', 'user_1', 1, mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('listConversations', () => {
    it('returns formatted conversation list', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([
        {
          conversationId: 'conv_1',
          userMode: 'dispatcher',
          title: 'Test Chat',
          _count: { messages: 5 },
          messages: [{ createdAt: new Date('2026-01-01') }],
          createdAt: new Date('2026-01-01'),
        },
      ]);

      const result = await service.listConversations('user_1', 1, 10);
      expect(result.conversations).toHaveLength(1);
      expect(result.conversations[0].conversationId).toBe('conv_1');
      expect(result.conversations[0].messageCount).toBe(5);
    });

    it('falls back to createdAt when no messages', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([
        {
          conversationId: 'conv_empty',
          userMode: 'prospect',
          title: null,
          _count: { messages: 0 },
          messages: [],
          createdAt: new Date('2026-02-15'),
        },
      ]);

      const result = await service.listConversations('user_1', 1);
      expect(result.conversations[0].lastMessageAt).toBe(new Date('2026-02-15').toISOString());
      expect(result.conversations[0].title).toBeNull();
    });
  });

  describe('getMessages', () => {
    it('returns messages for valid conversation', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue({
        conversationId: 'conv_1',
        userId: 1,
        tenantId: 1,
        userMode: 'dispatcher',
        title: 'Test',
        messages: [
          {
            messageId: 'msg_1',
            role: 'assistant',
            content: 'Hi',
            inputMode: 'text',
            intent: null,
            card: null,
            action: null,
            speakText: null,
            createdAt: new Date('2026-01-01'),
          },
        ],
      });

      const result = await service.getMessages('conv_1', 'user_1', 1);
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].messageId).toBe('msg_1');
    });

    it('throws NotFoundException for missing conversation', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(null);
      await expect(service.getMessages('conv_unknown', 'user_1', 1)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for wrong user', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue({
        conversationId: 'conv_1',
        userId: 999,
        tenantId: 1,
        userMode: 'dispatcher',
        messages: [],
      });
      await expect(service.getMessages('conv_1', 'user_1', 1)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('resumeAgent', () => {
    it('returns early when conversation validation fails', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const mockReq = { on: jest.fn() } as any;
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        setHeader: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        headersSent: false,
      } as any;

      await service.resumeAgent('conv_test', true, 'tc_1', 'run_1', 'user_nonexist', 1, mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalled();
    });

    it('handles resume error gracefully', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 1 });
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: 1,
        conversationId: 'conv_test',
        userId: 1,
        tenantId: 1,
        userMode: 'dispatcher',
        title: 'Test',
      });

      mockMastra.getMastra.mockReturnValue({
        getAgent: jest.fn().mockReturnValue({
          resumeStream: jest.fn().mockRejectedValue(new Error('Resume failed')),
        }),
      });

      const mockReq = { on: jest.fn() } as any;
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        setHeader: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        headersSent: false,
      } as any;

      await service.resumeAgent('conv_test', true, 'tc_1', 'run_1', 'user_1', 1, mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('injectAsyncResult', () => {
    it('creates an assistant message with card', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: 1,
        conversationId: 'conv_1',
      });

      await service.injectAsyncResult('conv_1', {
        text: 'Route planned',
        card: { type: 'route' },
      });

      expect(mockPrisma.conversationMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: 'assistant',
            content: 'Route planned',
            card: { type: 'route' },
          }),
        }),
      );
    });

    it('does nothing when conversation not found', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(null);
      await service.injectAsyncResult('conv_unknown', { text: 'test' });
      expect(mockPrisma.conversationMessage.create).not.toHaveBeenCalled();
    });
  });

  describe('streamMessage promptKey resolution', () => {
    const mockReq = () => ({ on: jest.fn() }) as any;
    const mockRes = () =>
      ({
        setHeader: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        headersSent: false,
      }) as any;

    let capturedAgentContent: string | undefined;

    beforeEach(() => {
      capturedAgentContent = undefined;
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: 1,
        conversationId: 'conv_test',
        userId: 1,
        tenantId: 1,
        userMode: 'dispatcher',
        title: null,
      });
      mockPrisma.tenant = {
        findUnique: jest.fn().mockResolvedValue({ companyName: 'Acme Trucking' }),
      };
      mockPrisma.user.findUnique = jest.fn().mockResolvedValue({ id: 1, role: 'DISPATCHER' });

      // Empty async iterable for agent.chat
      const emptyStream = (async function* () {
        // no-op
      })();
      mockAgentRegistry.get.mockReturnValue({
        id: 'dispatch',
        chat: jest.fn((c: string) => {
          capturedAgentContent = c;
          return emptyStream;
        }),
        execute: jest.fn(),
        getStatus: jest.fn(),
      });
    });

    it('resolves promptKey through PromptingService and uses rendered text as message content', async () => {
      mockPromptService.getPrompt.mockResolvedValue('rendered prompt body');

      await service.streamMessage('conv_test', '', 'text', 'user_1', 1, mockReq(), mockRes(), {
        promptKey: 'some-key',
        promptVariables: { foo: 'bar' },
      });

      expect(mockPromptService.getPrompt).toHaveBeenCalledWith('some-key', expect.objectContaining({ foo: 'bar' }));
      expect(capturedAgentContent).toBe('rendered prompt body');
    });

    it('overrides server-authoritative variables for sally-briefing regardless of client-supplied values', async () => {
      mockPromptService.getPrompt.mockResolvedValue('briefing rendered');

      await service.streamMessage('conv_test', '', 'text', 'user_1', 1, mockReq(), mockRes(), {
        promptKey: 'sally-briefing',
        promptVariables: {
          timeOfDay: 'CLIENT_LIES',
          tenantName: 'CLIENT_LIES',
          now: 'CLIENT_LIES',
          userRole: 'CLIENT_LIES',
          customVar: 'keep-me',
        },
      });

      const briefingCall = mockPromptService.getPrompt.mock.calls.find((c: any[]) => c[0] === 'sally-briefing');
      expect(briefingCall).toBeDefined();
      const [key, vars] = briefingCall;
      expect(key).toBe('sally-briefing');
      expect(vars.timeOfDay).not.toBe('CLIENT_LIES');
      expect(['morning', 'midday', 'evening']).toContain(vars.timeOfDay);
      expect(vars.tenantName).toBe('Acme Trucking');
      expect(vars.now).not.toBe('CLIENT_LIES');
      expect(vars.now).toMatch(/\d{4}-\d{2}-\d{2}T/);
      expect(vars.userRole).toBe('DISPATCHER');
      // Non-reserved client variables are preserved
      expect(vars.customVar).toBe('keep-me');
    });
  });
});
