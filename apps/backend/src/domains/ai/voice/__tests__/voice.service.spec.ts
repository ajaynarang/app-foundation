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
jest.mock('livekit-server-sdk', () => ({
  AccessToken: jest.fn().mockImplementation(() => ({
    addGrant: jest.fn(),
    toJwt: jest.fn().mockResolvedValue('jwt_token_123'),
    roomConfig: null,
  })),
  AgentDispatchClient: jest.fn().mockImplementation(() => ({
    createDispatch: jest.fn().mockResolvedValue(undefined),
  })),
  RoomAgentDispatch: jest.fn(),
  RoomConfiguration: jest.fn(),
}));

import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { VoiceService } from '../voice.service';

describe('VoiceService', () => {
  let service: VoiceService;
  let mockConfig: any;
  let mockPrisma: any;
  let mockModuleRef: any;

  beforeEach(() => {
    mockConfig = {
      get: jest.fn((key: string) => {
        const map: Record<string, string> = {
          LIVEKIT_URL: 'wss://livekit.test',
          LIVEKIT_API_KEY: 'api_key',
          LIVEKIT_API_SECRET: 'api_secret',
          DEEPGRAM_API_KEY: 'deepgram_key',
          CARTESIA_API_KEY: 'cartesia_key',
        };
        return map[key];
      }),
      getOrThrow: jest.fn((key: string) => {
        const map: Record<string, string> = {
          LIVEKIT_URL: 'wss://livekit.test',
          LIVEKIT_API_KEY: 'api_key',
          LIVEKIT_API_SECRET: 'api_secret',
        };
        return map[key];
      }),
    };

    mockPrisma = {
      featureFlag: {
        findUnique: jest.fn().mockResolvedValue({ enabled: true }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 1 }),
      },
      conversation: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1,
          conversationId: 'conv_1',
          userId: 1,
          tenantId: 1,
        }),
      },
      userPreferences: {
        findUnique: jest.fn().mockResolvedValue({
          voiceMode: 'manual',
          voiceId: 'warm',
          voiceSpeed: 'normal',
        }),
      },
    };

    mockModuleRef = {
      get: jest.fn(),
    };

    service = new VoiceService(mockConfig, mockPrisma, mockModuleRef);
  });

  describe('getStatus', () => {
    it('returns available when feature flag on and all keys configured', async () => {
      const status = await service.getStatus();
      expect(status.available).toBe(true);
      expect(status.missing).toHaveLength(0);
    });

    it('returns unavailable when feature flag is off', async () => {
      mockPrisma.featureFlag.findUnique.mockResolvedValue({ enabled: false });
      const status = await service.getStatus();
      expect(status.available).toBe(false);
      expect(status.missing).toContain('feature_flag_disabled');
    });

    it('returns unavailable when feature flag not found', async () => {
      mockPrisma.featureFlag.findUnique.mockResolvedValue(null);
      const status = await service.getStatus();
      expect(status.available).toBe(false);
    });

    it('returns missing keys when env vars not set', async () => {
      mockConfig.get.mockReturnValue(undefined);
      const status = await service.getStatus();
      expect(status.available).toBe(false);
      expect(status.missing.length).toBeGreaterThan(0);
    });
  });

  describe('generateToken', () => {
    it('returns token and url for valid conversation', async () => {
      const result = await service.generateToken('conv_1', 'user_1', 1);
      expect(result.token).toBe('jwt_token_123');
      expect(result.url).toBe('wss://livekit.test');
    });

    it('throws NotFoundException when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.generateToken('conv_1', 'user_x', 1)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when conversation not found', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(null);
      await expect(service.generateToken('conv_x', 'user_1', 1)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for wrong tenant', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: 1,
        conversationId: 'conv_1',
        userId: 1,
        tenantId: 99,
      });
      await expect(service.generateToken('conv_1', 'user_1', 1)).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException for wrong user', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: 1,
        conversationId: 'conv_1',
        userId: 999,
        tenantId: 1,
      });
      await expect(service.generateToken('conv_1', 'user_1', 1)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('generateVoiceResponse', () => {
    it('delegates to AssistantAiService.generateResponse', async () => {
      async function* mockGen() {
        yield { type: 'text-delta' as const, data: 'Hello' };
        yield { type: 'complete' as const, data: 'Hello' };
      }

      const mockAssistantAi = {
        generateResponse: jest.fn().mockReturnValue(mockGen()),
      };
      mockModuleRef.get.mockReturnValue(mockAssistantAi);

      // Force lazy resolution by accessing the method
      const gen = service.generateVoiceResponse('conv_1', 'hello', 'user_1', 1);
      const chunks: any[] = [];
      for await (const chunk of gen) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(2);
      expect(chunks[0].type).toBe('text-delta');
    });
  });
});
