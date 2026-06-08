// Mock transitive ESM dependencies that Jest can't parse
jest.mock('@presidio-dev/hai-guardrails', () => ({}));
jest.mock('redact-pii', () => ({}));
jest.mock('@mastra/pg', () => ({ PostgresStore: jest.fn() }));
jest.mock('@mastra/memory', () => ({ Memory: jest.fn() }));
jest.mock('@mastra/core', () => ({ Mastra: jest.fn() }));
jest.mock('@mastra/core/agent', () => ({ Agent: jest.fn() }));
jest.mock('@mastra/observability', () => ({ Observability: jest.fn() }));
jest.mock('@mastra/langfuse', () => ({ LangfuseExporter: jest.fn() }));

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
          userMode: 'prospect',
          title: null,
          createdAt: new Date(),
          messages: [
            {
              messageId: 'msg_test',
              role: 'assistant',
              content: 'Hi!',
              inputMode: 'text',
              speakText: 'Hi!',
              createdAt: new Date(),
            },
          ],
        }),
        findUnique: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
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
      moderate: jest.fn().mockResolvedValue({ blocked: false, events: [] }),
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
      get: jest.fn().mockReturnValue({
        id: 'dispatch',
        chat: jest.fn(),
        execute: jest.fn(),
        getStatus: jest.fn(),
      }),
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
    it('should create a conversation with a greeting', async () => {
      const result = await service.createConversation('user_1', 1, 'prospect');
      expect(result.conversationId).toBe('conv_test');
      expect(result.greeting.role).toBe('assistant');
    });
  });

  describe('streamMessage tool integration', () => {
    it('should request tools for the correct persona with tenant context', async () => {
      const mockReq = { on: jest.fn() } as any;
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: 1,
        conversationId: 'conv_test',
        userId: 1,
        tenantId: 1,
        userMode: 'prospect',
        title: 'Test',
        messages: [],
      });

      try {
        await service.streamMessage('conv_test', 'Hello', 'text', 'user_1', 1, mockReq, mockRes);
      } catch {
        // Expected: agent.stream is not mocked
      }

      expect(mockMcpTools.getToolsetsForPersona).toHaveBeenCalledWith(
        'prospect',
        {
          tenantId: 1,
          userId: 'user_1',
        },
        expect.any(Object),
      );
    });
  });

  describe('input moderation', () => {
    it('should block message when moderation flags input', async () => {
      mockModeration.moderate.mockResolvedValue({
        blocked: true,
        events: [
          {
            guard: 'content-moderation',
            result: 'block',
            categories: ['hate'],
          },
        ],
      });

      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: 1,
        conversationId: 'conv_test',
        userId: 1,
        tenantId: 1,
        userMode: 'dispatcher',
        title: 'Test',
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

      await service.streamMessage('conv_test', 'bad content', 'text', 'user_1', 1, mockReq, mockRes);

      expect(mockModeration.moderate).toHaveBeenCalledWith('bad content', 'input', 'dispatcher');
      expect(mockRes.write).toHaveBeenCalled();
      expect(mockRes.end).toHaveBeenCalled();
    });

    it('should allow clean messages through moderation', async () => {
      mockModeration.moderate.mockResolvedValue({
        blocked: false,
        events: [{ guard: 'content-moderation', result: 'pass' }],
      });

      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: 1,
        conversationId: 'conv_test',
        userId: 1,
        tenantId: 1,
        userMode: 'dispatcher',
        title: 'Test',
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

      try {
        await service.streamMessage('conv_test', 'What loads are available?', 'text', 'user_1', 1, mockReq, mockRes);
      } catch {
        // Expected: agent.stream is not mocked
      }

      expect(mockModeration.moderate).toHaveBeenCalledWith('What loads are available?', 'input', 'dispatcher');
      expect(mockMcpTools.getToolsetsForPersona).toHaveBeenCalled();
    });
  });

  // LLM-interaction audit (prompt text, tokens, cost, guardrail results) is
  // no longer written to a Sally-owned table — Langfuse is the single
  // observability surface for the AI path. The `AiAuditService` block that
  // lived here previously was asserting writes to tables that never existed
  // locally and threw on every call.
});
