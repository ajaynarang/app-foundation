jest.mock('@mastra/pg', () => ({ PostgresStore: jest.fn() }));
jest.mock('@mastra/memory', () => ({ Memory: jest.fn() }));
jest.mock('@mastra/core', () => ({ Mastra: jest.fn() }));
jest.mock('@mastra/core/agent', () => ({ Agent: jest.fn() }));
jest.mock('@mastra/observability', () => ({ Observability: jest.fn() }));
jest.mock('@mastra/langfuse', () => ({ LangfuseExporter: jest.fn() }));
jest.mock('langfuse-core', () => ({}));
jest.mock('langfuse', () => ({ Langfuse: jest.fn() }));

import { NotFoundException } from '@nestjs/common';
import { ProspectService } from '../prospect.service';

describe('ProspectService', () => {
  let service: ProspectService;
  let mockPrisma: any;
  let mockMcpTools: any;
  let mockMastra: any;
  let mockPromptService: any;
  let mockSessions: any;

  const mockConversation = {
    id: 1,
    conversationId: 'conv_test',
    userMode: 'prospect',
    title: null,
    createdAt: new Date(),
    messages: [
      {
        messageId: 'msg_1',
        role: 'assistant',
        content: "Hi! I'm SALLY.",
        inputMode: 'text',
        speakText: "Hi! I'm SALLY.",
        createdAt: new Date(),
      },
    ],
  };

  beforeEach(() => {
    mockPrisma = {
      conversation: {
        create: jest.fn().mockResolvedValue(mockConversation),
        findUnique: jest.fn().mockResolvedValue(mockConversation),
        update: jest.fn().mockResolvedValue(mockConversation),
      },
      conversationMessage: {
        create: jest.fn().mockResolvedValue({ id: 1 }),
      },
    };

    mockMcpTools = {
      getToolsetsForPersona: jest.fn().mockResolvedValue({ 'sally-tools': {} }),
    };

    mockMastra = {
      getMastra: jest.fn().mockReturnValue({
        getAgent: jest.fn().mockReturnValue({
          stream: jest.fn(),
        }),
      }),
    };

    mockPromptService = {
      getPrompt: jest.fn().mockResolvedValue('You are SALLY prospect assistant'),
    };

    mockSessions = {
      issue: jest.fn().mockResolvedValue({ id: 99, token: 'sess_test', conversationId: mockConversation.id }),
      resolveActive: jest
        .fn()
        .mockImplementation(async (token: string) =>
          token === 'sess_test' ? { id: 99, conversationId: mockConversation.id, token } : null,
        ),
    };

    service = new ProspectService(mockPrisma, mockMcpTools, mockMastra, mockPromptService, mockSessions);
  });

  describe('createConversation', () => {
    it('issues a session via ConversationSessionService and returns its token', async () => {
      const result = await service.createConversation();

      expect(result.conversationId).toBe('conv_test');
      expect(result.sessionToken).toBe('sess_test');
      expect(result.userMode).toBe('prospect');
      expect(result.greeting.role).toBe('assistant');
      expect(result.greeting.content).toContain('SALLY');

      // Token comes from the session service, not from a Conversation column
      expect(mockSessions.issue).toHaveBeenCalledWith(mockConversation.id, expect.any(Object));
      // Conversation row no longer carries a sessionToken
      expect(mockPrisma.conversation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ sessionToken: expect.anything() }),
        }),
      );
    });
  });

  describe('getMessages', () => {
    it('returns messages when the session resolves to this conversation', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue({
        ...mockConversation,
        messages: [
          {
            messageId: 'msg_1',
            role: 'assistant',
            content: 'Hi!',
            inputMode: 'text',
            intent: null,
            card: null,
            action: null,
            speakText: 'Hi!',
            createdAt: new Date(),
          },
        ],
      });

      const result = await service.getMessages('conv_test', 'sess_test');
      expect(result.conversationId).toBe('conv_test');
      expect(result.messages).toHaveLength(1);
      expect(mockSessions.resolveActive).toHaveBeenCalledWith('sess_test');
    });

    it('throws NotFoundException for a nonexistent conversation', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(null);
      await expect(service.getMessages('bad', 'sess')).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when the token does not resolve to a session', async () => {
      mockSessions.resolveActive.mockResolvedValue(null);
      await expect(service.getMessages('conv_test', 'wrong_token')).rejects.toThrow(/Invalid session token/);
    });

    it('throws ForbiddenException when the session resolves to a different conversation', async () => {
      mockSessions.resolveActive.mockResolvedValue({ id: 99, conversationId: 999, token: 'sess_test' });
      await expect(service.getMessages('conv_test', 'sess_test')).rejects.toThrow(/Invalid session token/);
    });
  });

  describe('streamMessage', () => {
    it('returns 404 for a nonexistent conversation', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(null);
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        setHeader: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        headersSent: false,
      };
      await service.streamMessage('bad', 'sess', 'hello', 'text', {} as any, res as any);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 403 when the token does not resolve to a session', async () => {
      mockSessions.resolveActive.mockResolvedValue(null);
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      await service.streamMessage('conv_test', 'wrong', 'hello', 'text', {} as any, res as any);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('returns 403 when the session belongs to a different conversation (cross-conversation token reuse)', async () => {
      mockSessions.resolveActive.mockResolvedValue({ id: 99, conversationId: 999, token: 'sess_test' });
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      await service.streamMessage('conv_test', 'sess_test', 'hello', 'text', {} as any, res as any);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('returns 403 for a non-prospect conversation', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue({
        ...mockConversation,
        userMode: 'dispatcher',
        messages: [],
      });
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      await service.streamMessage('conv_test', 'sess_test', 'hello', 'text', {} as any, res as any);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('handles non-HttpException errors with a 500', async () => {
      mockPrisma.conversation.findUnique.mockRejectedValue(new Error('DB connection error'));
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        headersSent: false,
      };
      await service.streamMessage('conv_test', 'sess_test', 'hello', 'text', {} as any, res as any);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 500 }));
    });

    it('stores the user message and auto-sets title on a valid conversation', async () => {
      const mockAgent = { stream: jest.fn().mockRejectedValue(new Error('AI unavailable')) };
      mockMastra.getMastra.mockReturnValue({
        getAgent: jest.fn().mockReturnValue(mockAgent),
      });

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        setHeader: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        headersSent: false,
      };

      await service.streamMessage('conv_test', 'sess_test', 'Tell me about pricing', 'text', {} as any, res as any);

      expect(mockPrisma.conversationMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role: 'user', content: 'Tell me about pricing' }),
        }),
      );
      expect(mockPrisma.conversation.update).toHaveBeenCalled();
      // AI streaming error caught and reported
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('does not re-set title when conversation already has one', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue({
        ...mockConversation,
        title: 'Existing Title',
      });

      const mockAgent = { stream: jest.fn().mockRejectedValue(new Error('AI unavailable')) };
      mockMastra.getMastra.mockReturnValue({
        getAgent: jest.fn().mockReturnValue(mockAgent),
      });

      const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), headersSent: false };
      await service.streamMessage('conv_test', 'sess_test', 'another question', 'text', {} as any, res as any);

      const updateCall = mockPrisma.conversation.update.mock.calls[0][0];
      expect(updateCall.data).not.toHaveProperty('title');
    });
  });
});
