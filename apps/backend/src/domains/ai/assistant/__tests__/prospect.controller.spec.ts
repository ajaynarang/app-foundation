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

import { UnauthorizedException } from '@nestjs/common';
import { ProspectController } from '../prospect.controller';

describe('ProspectController', () => {
  let controller: ProspectController;
  let mockService: any;

  beforeEach(() => {
    mockService = {
      createConversation: jest.fn().mockResolvedValue({
        conversationId: 'conv_1',
        sessionToken: 'sess_1',
        userMode: 'prospect',
      }),
      streamMessage: jest.fn().mockResolvedValue(undefined),
      getMessages: jest.fn().mockResolvedValue({
        conversationId: 'conv_1',
        messages: [],
      }),
    };

    controller = new ProspectController(mockService);
  });

  describe('createConversation', () => {
    it('delegates to service', async () => {
      const result = await controller.createConversation();
      expect(result.conversationId).toBe('conv_1');
      expect(mockService.createConversation).toHaveBeenCalled();
    });
  });

  describe('sendMessage', () => {
    it('returns 401 when session token missing', async () => {
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;
      await controller.sendMessage(
        'conv_1',
        '', // empty token
        { content: 'Hello', inputMode: 'text' },
        {} as any,
        res,
      );
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('delegates to service when token present', async () => {
      const req = {} as any;
      const res = {} as any;
      await controller.sendMessage('conv_1', 'sess_1', { content: 'Hello', inputMode: 'text' }, req, res);
      expect(mockService.streamMessage).toHaveBeenCalledWith('conv_1', 'sess_1', 'Hello', 'text', req, res);
    });
  });

  describe('getMessages', () => {
    it('throws UnauthorizedException when token missing', async () => {
      await expect(controller.getMessages('conv_1', '')).rejects.toThrow(UnauthorizedException);
    });

    it('delegates to service when token present', async () => {
      await controller.getMessages('conv_1', 'sess_1');
      expect(mockService.getMessages).toHaveBeenCalledWith('conv_1', 'sess_1');
    });
  });
});
