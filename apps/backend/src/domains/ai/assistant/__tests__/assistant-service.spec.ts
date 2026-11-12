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
  ...jest.requireActual('ai'),
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

import { NotFoundException } from '@nestjs/common';
import { AssistantAiService } from '../assistant.service';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { McpToolService } from '../../mcp/mcp-tool.service';
import { MastraProvider } from '../mastra/mastra.provider';
import { ModerationService } from '../../moderation/moderation.service';
import { PromptingService } from '../../../prompting';
import { AssistantRouterService } from '../../orchestrator/assistant-router.service';
import { AgentRegistry } from '../../agents/agent.registry';
import { AiTelemetryService } from '../../infrastructure/telemetry/ai-telemetry.service';
import { AiRouteResolver } from '../../routing/ai-route-resolver.service';
import { REQUEST_MODEL_KEY } from '../../routing/request-model-key';
import { ZeroRetentionUnavailable } from '../../infrastructure/redaction/zero-retention-unavailable.error';
import { makeResolver } from '../../routing/__tests__/resolver-fixtures';
import { AiBudgetExceededError } from '../../infrastructure/telemetry/ai-budget-exceeded.error';
import { CredentialCryptoService } from '../../routing/credential-crypto.service';
import { AI_SETTINGS_WEB_PATH } from '../../../../shared/web-routes';

const OPENROUTER = { openRouterApiKey: 'sk-or-test' };

describe('AssistantAiService', () => {
  let service: AssistantAiService;
  let mockPrisma: any;
  let mockMcpTools: any;
  let mockMastra: any;
  let mockModeration: any;
  let mockPromptService: any;
  let mockAssistantRouter: any;
  let mockAgentRegistry: any;
  let mockTelemetry: { assertBudget: jest.Mock };
  /** Whether the deployment allows workspace AI keys (`AI_CREDENTIALS_KEY` set). */
  let byokEnabled: boolean;

  const buildService = (resolver: AiRouteResolver) =>
    new AssistantAiService(
      mockPrisma,
      mockMcpTools,
      mockMastra,
      mockModeration,
      mockPromptService,
      mockAssistantRouter,
      mockAgentRegistry,
      mockTelemetry as unknown as AiTelemetryService,
      resolver,
      { isConfigured: () => byokEnabled } as unknown as CredentialCryptoService,
    );

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 1 }),
      },
      conversation: {
        create: jest.fn().mockResolvedValue({
          id: 1,
          conversationId: 'conv_test',
          userMode: 'member',
          title: null,
          createdAt: new Date('2026-01-01'),
          messages: [
            {
              messageId: 'msg_test',
              role: 'assistant',
              content: "Hi! I'm the assistant.",
              inputMode: 'text',
              speakText: "Hi! I'm the assistant.",
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
      workspaceMember: {
        findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }),
      },
    };
    byokEnabled = false;

    mockMcpTools = {
      getToolsForPersona: jest.fn().mockResolvedValue({}),
      getToolsetsForPersona: jest.fn().mockResolvedValue({ 'app-tools': {} }),
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

    mockAssistantRouter = {
      route: jest.fn().mockResolvedValue({
        agentId: 'assistant',
        taskSkill: null,
        taskSkillContent: null,
        source: 'default',
      }),
      defaultAgentFor: jest.fn().mockReturnValue('assistant'),
    };

    mockAgentRegistry = {
      get: jest.fn(),
      getForPersona: jest.fn().mockReturnValue([]),
      getAll: jest.fn().mockReturnValue([]),
    };

    mockTelemetry = { assertBudget: jest.fn().mockResolvedValue({ state: 'ok' }) };
    service = buildService(makeResolver({ config: OPENROUTER }).resolver);
  });

  describe('createConversation', () => {
    it('creates a conversation and returns greeting', async () => {
      const result = await service.createConversation('user_1', 1, 'member');
      expect(result.conversationId).toBe('conv_test');
      expect(result.userMode).toBe('member');
      expect(result.greeting.role).toBe('assistant');
      expect(result.greeting.content).toContain('assistant');
      expect(mockPrisma.conversation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userMode: 'member',
            tenantId: 1,
            userId: 1,
          }),
        }),
      );
    });

    it('throws NotFoundException when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.createConversation('user_nonexist', 1, 'member')).rejects.toThrow(NotFoundException);
    });
  });

  describe('generateResponse', () => {
    beforeEach(() => {
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: 1,
        conversationId: 'conv_test',
        userId: 1,
        tenantId: 1,
        userMode: 'member',
        title: null,
      });
    });

    it('throws NotFoundException for unknown conversation', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(null);
      const gen = service.generateResponse('conv_unknown', 'hello', 'text', 'user_1', 1);
      await expect(gen.next()).rejects.toThrow(NotFoundException);
    });

    it('answers 404 for a conversation of another tenant: a 403 would confirm it exists', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: 1,
        conversationId: 'conv_test',
        userId: 1,
        tenantId: 99,
        userMode: 'member',
        title: null,
      });
      const gen = service.generateResponse('conv_test', 'hello', 'text', 'user_1', 1);
      await expect(gen.next()).rejects.toThrow(NotFoundException);
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

      const gen = service.generateResponse('conv_test', 'What can you help me with?', 'text', 'user_1', 1);
      await gen.next();

      expect(mockPrisma.conversationMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: 'user',
            content: 'What can you help me with?',
          }),
        }),
      );
      expect(mockPrisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'What can you help me with?',
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
        id: 'assistant',
        chat: jest.fn().mockReturnValue(mockChat()),
      });

      const gen = service.generateResponse('conv_test', 'Show my summary', 'text', 'user_1', 1);

      const chunks: any[] = [];
      for await (const chunk of gen) {
        chunks.push(chunk);
      }

      expect(mockAssistantRouter.route).toHaveBeenCalledWith('Show my summary', 'member', 1);
      expect(mockAgentRegistry.get).toHaveBeenCalledWith('assistant');
      expect(chunks.some((c) => c.type === 'text-delta')).toBe(true);
      expect(chunks.some((c) => c.type === 'complete')).toBe(true);
    });

    it('refuses a zero-retention tenant before the agent runs or the budget is read', async () => {
      service = buildService(makeResolver({ aiZeroRetention: true, config: OPENROUTER }).resolver);
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: 1,
        conversationId: 'conv_test',
        userId: 1,
        tenantId: 1,
        userMode: 'member',
        title: 'Existing',
      });

      await expect(async () => {
        for await (const _chunk of service.generateResponse('conv_test', 'Private', 'text', 'user_1', 1)) {
          // drain
        }
      }).rejects.toThrow(ZeroRetentionUnavailable);

      expect(mockAgentRegistry.get).not.toHaveBeenCalled();
      expect(mockTelemetry.assertBudget).not.toHaveBeenCalled();
    });

    describe('the platform cap applies only when the platform pays', () => {
      async function* answer() {
        yield { type: 'text-delta' as const, data: 'Hi' };
      }
      const routeWithPayer = (payer: 'PLATFORM' | 'TENANT') => {
        const platform = makeResolver({ config: OPENROUTER }).resolver;
        return {
          resolve: async (tenantId: number, need: 'language' | 'embedding') => ({
            ...(await platform.resolve(tenantId, need)),
            payer,
          }),
        } as unknown as AiRouteResolver;
      };
      const overCap = () =>
        mockTelemetry.assertBudget.mockRejectedValue(
          new AiBudgetExceededError(1, {
            state: 'hard',
            dailyUsdSpent: '25',
            monthlyUsdSpent: '25',
            dailySoftUsd: '5',
            dailyHardUsd: '20',
            monthlySoftUsd: '50',
            monthlyHardUsd: '200',
          }),
        );

      it("serves a workspace over the cap when its language route is the workspace's own key", async () => {
        service = buildService(routeWithPayer('TENANT'));
        overCap();
        mockAgentRegistry.get.mockReturnValue({ id: 'assistant', chat: jest.fn().mockReturnValue(answer()) });

        const chunks: any[] = [];
        for await (const chunk of service.generateResponse('conv_test', 'hello', 'text', 'user_1', 1))
          chunks.push(chunk);

        expect(mockTelemetry.assertBudget).not.toHaveBeenCalled();
        expect(chunks.some((c) => c.type === 'text-delta')).toBe(true);
      });

      it('blocks a platform-paid turn over the cap before the agent runs', async () => {
        service = buildService(routeWithPayer('PLATFORM'));
        overCap();

        const chunks: any[] = [];
        for await (const chunk of service.generateResponse('conv_test', 'hello', 'text', 'user_1', 1))
          chunks.push(chunk);

        expect(mockTelemetry.assertBudget).toHaveBeenCalledWith(1);
        expect(chunks[0]).toMatchObject({ type: 'blocked' });
        expect(mockAgentRegistry.get).not.toHaveBeenCalled();
      });

      const blockedText = async () => {
        service = buildService(routeWithPayer('PLATFORM'));
        overCap();
        const chunks: any[] = [];
        for await (const chunk of service.generateResponse('conv_test', 'hello', 'text', 'user_1', 1))
          chunks.push(chunk);
        return chunks[0].data as string;
      };

      it('links the workspace owner to AI Keys when the deployment allows workspace keys', async () => {
        byokEnabled = true;
        expect(await blockedText()).toContain(`](${AI_SETTINGS_WEB_PATH})`);
        expect(mockPrisma.workspaceMember.findUnique).toHaveBeenCalledWith(
          expect.objectContaining({ where: { userId_tenantId: { userId: 1, tenantId: 1 } } }),
        );
      });

      it('tells anyone but the owner to ask the workspace owner, with no link', async () => {
        byokEnabled = true;
        mockPrisma.workspaceMember.findUnique.mockResolvedValue({ role: 'ADMIN' });
        const text = await blockedText();
        expect(text).not.toContain(AI_SETTINGS_WEB_PATH);
        expect(text).toMatch(/Ask the workspace owner/);
      });

      it('offers no key when the deployment has bring-your-own-key off, even to the owner', async () => {
        const text = await blockedText();
        expect(text).not.toContain(AI_SETTINGS_WEB_PATH);
        expect(text).not.toMatch(/own AI key/);
      });
    });

    it('skips external moderation for a zero-retention tenant (tells the moderator the tenant)', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: 1,
        conversationId: 'conv_test',
        userId: 1,
        tenantId: 1,
        userMode: 'member',
        title: 'Existing',
      });
      mockModeration.moderate.mockResolvedValue({ blocked: true, events: [] });

      for await (const _chunk of service.generateResponse('conv_test', 'hello', 'text', 'user_1', 1)) {
        // drain
      }

      expect(mockModeration.moderate).toHaveBeenCalledWith('hello', 'input', 'member', 1);
    });

    it('yields followups when agent response contains them', async () => {
      async function* mockChat() {
        yield {
          type: 'text-delta' as const,
          data: 'Answer.\n\n<followups>\nView settings\nOpen documentation\n</followups>',
        };
      }

      mockAgentRegistry.get.mockReturnValue({
        id: 'assistant',
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
        id: 'assistant',
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
        id: 'assistant',
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
    // AiAuditService failed. AiAuditService is deleted; no assistant-owned
    // audit write happens on the block path anymore, so the test is moot.

    it('handles output moderation failure gracefully', async () => {
      mockModeration.moderate
        .mockResolvedValueOnce({ blocked: false, events: [] }) // input pass
        .mockRejectedValueOnce(new Error('Output mod failed')); // output fail

      async function* mockChat() {
        yield { type: 'text-delta' as const, data: 'Text' };
      }
      mockAgentRegistry.get.mockReturnValue({
        id: 'assistant',
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
        id: 'assistant',
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
        userMode: 'member',
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
        id: 'assistant',
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
        userMode: 'member',
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

      const mockReq = { on: jest.fn(), url: '/api/v1/conversations/conv_test/messages', method: 'POST' } as any;
      const mockRes = {
        setHeader: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        status: jest.fn().mockReturnThis(),
        removeHeader: jest.fn(),
        json: jest.fn(),
        headersSent: false,
      } as any;

      await service.streamMessage('conv_test', 'hello', 'text', 'user_1', 1, mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      // The failure leaves as the one error envelope: a code and `detail`, never a bare `message`.
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 500, code: 'INTERNAL' }));
      expect(mockRes.json.mock.calls[0][0]).not.toHaveProperty('message');
    });
  });

  describe('streamMessage — routing errors before the first byte', () => {
    it('answers a routing refusal with its own status and code, not a 500', async () => {
      service = buildService(makeResolver().resolver); // no platform key: nothing serves language
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: 1,
        conversationId: 'conv_test',
        userId: 1,
        tenantId: 1,
        userMode: 'member',
        title: 'Existing',
      });
      const mockReq = { on: jest.fn(), url: '/api/v1/conversations/conv_test/messages', method: 'POST' } as any;
      const mockRes = {
        setHeader: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        status: jest.fn().mockReturnThis(),
        removeHeader: jest.fn(),
        json: jest.fn(),
        headersSent: false,
      } as any;

      await service.streamMessage('conv_test', 'hello', 'text', 'user_1', 1, mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(503);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 503 }));
      expect(mockRes.write).not.toHaveBeenCalled();
    });

    const notConfiguredDetail = async () => {
      service = buildService(makeResolver().resolver);
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: 1,
        conversationId: 'conv_test',
        userId: 1,
        tenantId: 1,
        userMode: 'member',
        title: 'Existing',
      });
      const mockReq = { on: jest.fn(), url: '/api/v1/conversations/conv_test/messages', method: 'POST' } as any;
      const mockRes = {
        setHeader: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        status: jest.fn().mockReturnThis(),
        removeHeader: jest.fn(),
        json: jest.fn(),
        headersSent: false,
      } as any;
      await service.streamMessage('conv_test', 'hello', 'text', 'user_1', 1, mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(503);
      return mockRes.json.mock.calls[0][0].detail as string;
    };

    it('links the workspace owner to AI Keys when nothing serves chat and workspace keys are allowed', async () => {
      byokEnabled = true;
      expect(await notConfiguredDetail()).toContain(`](${AI_SETTINGS_WEB_PATH})`);
    });

    it('tells a member to ask the workspace owner when nothing serves chat', async () => {
      byokEnabled = true;
      mockPrisma.workspaceMember.findUnique.mockResolvedValue({ role: 'MEMBER' });
      const detail = await notConfiguredDetail();
      expect(detail).not.toContain(AI_SETTINGS_WEB_PATH);
      expect(detail).toMatch(/Ask the workspace owner/);
    });

    it("keeps the deployment's own message when workspace keys are off", async () => {
      const detail = await notConfiguredDetail();
      expect(detail).not.toContain(AI_SETTINGS_WEB_PATH);
      expect(detail).toMatch(/Ask your administrator/);
    });
  });

  describe('listConversations', () => {
    it('returns formatted conversation list', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([
        {
          conversationId: 'conv_1',
          userMode: 'member',
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
          userMode: 'member',
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
        userMode: 'member',
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

    it('answers 404 for a conversation of another user: a 403 would confirm it exists', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue({
        conversationId: 'conv_1',
        userId: 999,
        tenantId: 1,
        userMode: 'member',
        messages: [],
      });
      await expect(service.getMessages('conv_1', 'user_1', 1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('resumeAgent', () => {
    it('returns early when conversation validation fails', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const mockReq = { on: jest.fn(), url: '/api/v1/conversations/conv_test/messages', method: 'POST' } as any;
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        removeHeader: jest.fn(),
        json: jest.fn(),
        setHeader: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        headersSent: false,
      } as any;

      await service.resumeAgent('conv_test', true, 'tc_1', 'run_1', 'user_nonexist', 1, mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalled();
    });

    it("resumes on the tenant's resolved model, passed through the request context", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 1 });
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: 1,
        conversationId: 'conv_test',
        userId: 1,
        tenantId: 1,
        userMode: 'member',
        title: 'Test',
      });
      mockAgentRegistry.get.mockReturnValue({ modelAlias: 'standard' });
      const resumeStream = jest.fn().mockRejectedValue(new Error('stop here'));
      mockMastra.getMastra.mockReturnValue({ getAgent: jest.fn().mockReturnValue({ resumeStream }) });
      const mockReq = { on: jest.fn(), url: '/api/v1/conversations/conv_test/resume', method: 'POST' } as any;
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        removeHeader: jest.fn(),
        json: jest.fn(),
        setHeader: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        headersSent: false,
      } as any;

      await service.resumeAgent('conv_test', true, 'tc_1', 'run_1', 'user_1', 1, mockReq, mockRes);

      const requestContext = resumeStream.mock.calls[0][1].requestContext;
      expect(requestContext.get(REQUEST_MODEL_KEY)).toMatchObject({ modelId: 'anthropic/claude-sonnet-5.5' });
    });

    it('handles resume error gracefully', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 1 });
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: 1,
        conversationId: 'conv_test',
        userId: 1,
        tenantId: 1,
        userMode: 'member',
        title: 'Test',
      });

      mockAgentRegistry.get.mockReturnValue({ modelAlias: 'standard' });
      mockMastra.getMastra.mockReturnValue({
        getAgent: jest.fn().mockReturnValue({
          resumeStream: jest.fn().mockRejectedValue(new Error('Resume failed')),
        }),
      });

      const mockReq = { on: jest.fn(), url: '/api/v1/conversations/conv_test/messages', method: 'POST' } as any;
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        removeHeader: jest.fn(),
        json: jest.fn(),
        setHeader: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        headersSent: false,
      } as any;

      await service.resumeAgent('conv_test', true, 'tc_1', 'run_1', 'user_1', 1, mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      // The failure leaves as the one error envelope: a code and `detail`, never a bare `message`.
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 500, code: 'INTERNAL' }));
      expect(mockRes.json.mock.calls[0][0]).not.toHaveProperty('message');
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
        userMode: 'member',
        title: null,
      });
      mockPrisma.tenant = {
        findUnique: jest.fn().mockResolvedValue({ companyName: 'Acme Inc' }),
      };
      mockPrisma.user.findUnique = jest.fn().mockResolvedValue({ id: 1, role: 'MEMBER' });

      // Empty async iterable for agent.chat
      const emptyStream = (async function* () {
        // no-op
      })();
      mockAgentRegistry.get.mockReturnValue({
        id: 'assistant',
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

    // NOTE: the original platform's briefing prompt (server-authoritative variable overrides
    // in resolvePromptKey) was not carried into the starter. If you add a
    // prompt whose variables must be trusted (tenant name, role, time),
    // override them server-side in resolvePromptKey and add a test asserting
    // client-supplied values for those keys are ignored.
  });
});
