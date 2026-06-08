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
jest.mock('livekit-server-sdk', () => ({}));

import { ServiceUnavailableException, ForbiddenException } from '@nestjs/common';
import { VoiceController } from '../voice.controller';

describe('VoiceController', () => {
  let controller: VoiceController;
  let mockVoiceService: any;

  beforeEach(() => {
    mockVoiceService = {
      getStatus: jest.fn().mockResolvedValue({ available: true, missing: [] }),
      generateToken: jest.fn().mockResolvedValue({ token: 'jwt_123', url: 'wss://livekit.test' }),
      generateVoiceResponse: jest.fn(),
    };

    controller = new VoiceController(mockVoiceService);
  });

  describe('getStatus', () => {
    it('returns available flag', async () => {
      const result = await controller.getStatus();
      expect(result).toEqual({ available: true });
    });

    it('does not expose missing env var names', async () => {
      mockVoiceService.getStatus.mockResolvedValue({
        available: false,
        missing: ['LIVEKIT_API_KEY'],
      });
      const result = await controller.getStatus();
      expect(result).toEqual({ available: false });
      expect((result as any).missing).toBeUndefined();
    });
  });

  describe('getToken', () => {
    it('returns token when voice is available', async () => {
      const user = { userId: 'user_1', tenantDbId: 1 };
      const result = await controller.getToken(user, {
        conversationId: 'conv_1',
      });
      expect(result.token).toBe('jwt_123');
    });

    it('throws ServiceUnavailableException when voice not available', async () => {
      mockVoiceService.getStatus.mockResolvedValue({
        available: false,
        missing: ['key'],
      });
      const user = { userId: 'user_1', tenantDbId: 1 };
      await expect(controller.getToken(user, { conversationId: 'conv_1' })).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('internalRespond', () => {
    it('validates voice agent secret', async () => {
      const req = { headers: {} } as any;
      const res = {} as any;
      const dto = {
        conversationId: 'conv_1',
        text: 'hello',
        userId: 'user_1',
        tenantId: 1,
      };

      await expect(controller.internalRespond(req, res, dto)).rejects.toThrow(ForbiddenException);
    });

    it('validates secret with constant-time comparison', async () => {
      process.env.VOICE_AGENT_SECRET = 'test_secret';
      const req = {
        headers: { 'x-voice-agent-secret': 'wrong_secret' },
      } as any;
      const res = {} as any;
      const dto = {
        conversationId: 'conv_1',
        text: 'hello',
        userId: 'user_1',
        tenantId: 1,
      };

      await expect(controller.internalRespond(req, res, dto)).rejects.toThrow(ForbiddenException);
      delete process.env.VOICE_AGENT_SECRET;
    });

    it('streams NDJSON response for valid secret', async () => {
      process.env.VOICE_AGENT_SECRET = 'test_secret';

      async function* mockGen() {
        yield { type: 'text-delta', data: 'Hello' };
      }

      mockVoiceService.generateVoiceResponse.mockReturnValue(mockGen());

      const req = {
        headers: { 'x-voice-agent-secret': 'test_secret' },
      } as any;
      const res = {
        setHeader: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
      } as any;
      const dto = {
        conversationId: 'conv_1',
        text: 'hello',
        userId: 'user_1',
        tenantId: 1,
      };

      await controller.internalRespond(req, res, dto);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/x-ndjson');
      expect(res.write).toHaveBeenCalled();
      expect(res.end).toHaveBeenCalled();
      delete process.env.VOICE_AGENT_SECRET;
    });
  });
});
