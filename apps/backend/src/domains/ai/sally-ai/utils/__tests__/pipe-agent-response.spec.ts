jest.mock('@mastra/core', () => ({}));
jest.mock('@mastra/core/agent', () => ({}));
jest.mock('@mastra/pg', () => ({ PostgresStore: jest.fn() }));
jest.mock('@mastra/memory', () => ({ Memory: jest.fn() }));
jest.mock('@mastra/observability', () => ({ Observability: jest.fn() }));
jest.mock('@mastra/langfuse', () => ({ LangfuseExporter: jest.fn() }));

import { pipeAgentResponse } from '../pipe-agent-response';

function createReadableStream(chunks: string[]): ReadableStream<string> {
  return new ReadableStream<string>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

describe('pipeAgentResponse', () => {
  let mockRes: any;
  let mockReq: any;
  let mockPrisma: any;
  let mockLogger: any;

  beforeEach(() => {
    mockRes = {
      setHeader: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
    };
    mockReq = {
      on: jest.fn(),
    };
    mockPrisma = {
      conversationMessage: {
        create: jest.fn().mockResolvedValue({ id: 1 }),
      },
    };
    mockLogger = {
      warn: jest.fn(),
      error: jest.fn(),
    };
  });

  it('sets streaming headers', async () => {
    const response = {
      textStream: createReadableStream([]),
    };

    await pipeAgentResponse(response as any, {
      conversationDbId: 1,
      conversationId: 'conv_1',
      req: mockReq,
      res: mockRes,
      prisma: mockPrisma,
      logger: mockLogger,
    });

    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/plain; charset=utf-8');
    expect(mockRes.setHeader).toHaveBeenCalledWith('Transfer-Encoding', 'chunked');
    expect(mockRes.end).toHaveBeenCalled();
  });

  it('streams text deltas and persists assistant message', async () => {
    const response = {
      textStream: createReadableStream(['Hello', ' world']),
    };

    await pipeAgentResponse(response as any, {
      conversationDbId: 1,
      conversationId: 'conv_1',
      req: mockReq,
      res: mockRes,
      prisma: mockPrisma,
      logger: mockLogger,
    });

    expect(mockRes.write).toHaveBeenCalledWith(`0:${JSON.stringify('Hello')}\n`);
    expect(mockRes.write).toHaveBeenCalledWith(`0:${JSON.stringify(' world')}\n`);
    expect(mockPrisma.conversationMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: 'assistant',
          content: 'Hello world',
        }),
      }),
    );
  });

  it('streams follow-ups extracted from text', async () => {
    const text = 'Answer.\n\n<followups>\nWhat loads are active?\nCheck fleet status\n</followups>';
    const response = {
      textStream: createReadableStream([text]),
    };

    await pipeAgentResponse(response as any, {
      conversationDbId: 1,
      conversationId: 'conv_1',
      req: mockReq,
      res: mockRes,
      prisma: mockPrisma,
      logger: mockLogger,
    });

    // Should write follow-ups as protocol line a:
    const followupWrite = mockRes.write.mock.calls.find((c: any[]) => c[0].startsWith('a:'));
    expect(followupWrite).toBeDefined();
  });

  it('streams card data from card accumulator', async () => {
    const response = {
      textStream: createReadableStream(['Answer']),
    };

    const cardAccumulator = {
      card: { type: 'fleet', data: { loads: 5 } },
    };

    await pipeAgentResponse(response as any, {
      conversationDbId: 1,
      conversationId: 'conv_1',
      req: mockReq,
      res: mockRes,
      prisma: mockPrisma,
      logger: mockLogger,
      cardAccumulator: cardAccumulator as any,
    });

    const cardWrite = mockRes.write.mock.calls.find((c: any[]) => c[0].startsWith('8:'));
    expect(cardWrite).toBeDefined();
  });

  it('handles HITL suspend payload', async () => {
    const response = {
      textStream: createReadableStream(['Please confirm']),
      suspendPayload: { action: 'acknowledge-alert', entityId: 'alert_1' },
      runId: 'run_123',
    };

    await pipeAgentResponse(response as any, {
      conversationDbId: 1,
      conversationId: 'conv_1',
      req: mockReq,
      res: mockRes,
      prisma: mockPrisma,
      logger: mockLogger,
    });

    const suspendWrite = mockRes.write.mock.calls.find((c: any[]) => c[0].startsWith('9:'));
    expect(suspendWrite).toBeDefined();
    const payload = JSON.parse(suspendWrite[0].slice(2).trim());
    expect(payload.runId).toBe('run_123');
  });

  it('applies output moderation when moderationService is provided', async () => {
    const response = {
      textStream: createReadableStream(['Some PII text']),
    };

    const mockModeration = {
      moderate: jest.fn().mockResolvedValue({ redactedText: 'Redacted text' }),
    };

    await pipeAgentResponse(response as any, {
      conversationDbId: 1,
      conversationId: 'conv_1',
      req: mockReq,
      res: mockRes,
      prisma: mockPrisma,
      logger: mockLogger,
      moderationService: mockModeration as any,
    });

    expect(mockModeration.moderate).toHaveBeenCalledWith('Some PII text', 'output', '');
    expect(mockPrisma.conversationMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: 'Redacted text',
        }),
      }),
    );
  });

  it('does not persist message when text is empty', async () => {
    const response = {
      textStream: createReadableStream([]),
    };

    await pipeAgentResponse(response as any, {
      conversationDbId: 1,
      conversationId: 'conv_1',
      req: mockReq,
      res: mockRes,
      prisma: mockPrisma,
      logger: mockLogger,
    });

    expect(mockPrisma.conversationMessage.create).not.toHaveBeenCalled();
  });

  it('stops streaming when client disconnects', async () => {
    mockReq.on = jest.fn();

    const response = {
      textStream: createReadableStream(['Hello', ' world']),
    };

    // Simulate disconnect before piping
    const originalPipe = pipeAgentResponse;
    mockReq.on.mockImplementation((event: string, handler: () => void) => {
      if (event === 'close') {
        // Trigger disconnect immediately
        handler();
      }
    });

    await originalPipe(response as any, {
      conversationDbId: 1,
      conversationId: 'conv_1',
      req: mockReq,
      res: mockRes,
      prisma: mockPrisma,
      logger: mockLogger,
    });

    expect(mockRes.end).toHaveBeenCalled();
  });

  it('handles persist error gracefully', async () => {
    const response = {
      textStream: createReadableStream(['Answer']),
    };

    mockPrisma.conversationMessage.create.mockRejectedValue(new Error('DB error'));

    await pipeAgentResponse(response as any, {
      conversationDbId: 1,
      conversationId: 'conv_1',
      req: mockReq,
      res: mockRes,
      prisma: mockPrisma,
      logger: mockLogger,
    });

    expect(mockLogger.error).toHaveBeenCalled();
    expect(mockRes.end).toHaveBeenCalled();
  });
});
