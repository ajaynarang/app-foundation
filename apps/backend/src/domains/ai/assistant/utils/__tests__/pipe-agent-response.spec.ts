jest.mock('@mastra/core', () => ({}));
jest.mock('@mastra/core/agent', () => ({}));
jest.mock('@mastra/pg', () => ({ PostgresStore: jest.fn() }));
jest.mock('@mastra/memory', () => ({ Memory: jest.fn() }));
jest.mock('@mastra/observability', () => ({ Observability: jest.fn() }));
jest.mock('@mastra/langfuse', () => ({ LangfuseExporter: jest.fn() }));

import { invalidState } from '@appshore/kernel/shared/errors/api-errors';
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

  describe('a stream that fails', () => {
    /** A text stream that yields `parts`, then throws. */
    function failingStream(parts: string[], error: Error): ReadableStream<string> {
      let i = 0;
      return new ReadableStream<string>({
        pull(controller) {
          if (i < parts.length) controller.enqueue(parts[i++]);
          else controller.error(error);
        },
      });
    }

    it('after text was sent: ends with one terminal x: frame, the generic copy, and persists nothing', async () => {
      // A response whose headers went out with the first frame.
      mockRes.write.mockImplementation(() => {
        mockRes.headersSent = true;
      });

      await pipeAgentResponse(
        { textStream: failingStream(['Half an'], new Error('socket hang up: internal detail')) },
        {
          conversationDbId: 1,
          conversationId: 'conv_1',
          req: mockReq,
          res: mockRes,
          prisma: mockPrisma,
          logger: mockLogger,
        },
      );

      const frames = mockRes.write.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(frames[0]).toBe(`0:${JSON.stringify('Half an')}\n`);
      const last = frames[frames.length - 1];
      expect(last.startsWith('x:')).toBe(true);
      const payload = JSON.parse(last.slice(2));
      expect(payload).toEqual({ code: 'INTERNAL', detail: expect.any(String) });
      expect(payload.detail).not.toContain('internal detail');
      expect(frames.filter((f: string) => f.startsWith('x:'))).toHaveLength(1);
      expect(mockRes.end).toHaveBeenCalled();
      expect(mockPrisma.conversationMessage.create).not.toHaveBeenCalled();
    });

    it('a stream that finishes with an error Mastra recorded on `response.error`: one x: frame, nothing after, nothing persisted', async () => {
      mockRes.write.mockImplementation(() => {
        mockRes.headersSent = true;
      });
      const text = 'Half an answer\n\n<followups>\nNext?\n</followups>';

      await pipeAgentResponse(
        {
          textStream: createReadableStream([text]),
          error: new Error('provider 500: internal detail'),
          suspendPayload: { action: 'confirm' },
          runId: 'run_1',
        },
        {
          conversationDbId: 1,
          conversationId: 'conv_1',
          req: mockReq,
          res: mockRes,
          prisma: mockPrisma,
          logger: mockLogger,
          cardAccumulator: { card: { type: 'summary' } } as any,
        },
      );

      const frames = mockRes.write.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(frames[0]).toBe(`0:${JSON.stringify(text)}\n`);
      const last = frames[frames.length - 1];
      expect(last.startsWith('x:')).toBe(true);
      expect(JSON.parse(last.slice(2))).toEqual({ code: 'INTERNAL', detail: expect.any(String) });
      expect(last).not.toContain('internal detail');
      // No follow-up, card or suspend frame for a failed turn.
      expect(frames.filter((f: string) => /^(a|8|9):/.test(f))).toHaveLength(0);
      expect(mockRes.end).toHaveBeenCalled();
      expect(mockPrisma.conversationMessage.create).not.toHaveBeenCalled();
    });

    it('maps a failure through `mapError` (a credit refusal becomes its own code and copy)', async () => {
      mockRes.write.mockImplementation(() => {
        mockRes.headersSent = true;
      });
      const mapped = invalidState('mapped copy');
      const mapError = jest.fn().mockReturnValue(mapped);
      const recorded = { statusCode: 402 };

      await pipeAgentResponse(
        { textStream: createReadableStream(['Half']), error: recorded },
        {
          conversationDbId: 1,
          conversationId: 'conv_1',
          req: mockReq,
          res: mockRes,
          prisma: mockPrisma,
          logger: mockLogger,
          mapError,
        },
      );

      expect(mapError).toHaveBeenCalledWith(recorded);
      const frames = mockRes.write.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(JSON.parse(frames[frames.length - 1].slice(2))).toEqual({ code: 'INVALID_STATE', detail: 'mapped copy' });
    });

    it('a recorded error that reading throws on is treated as no error', async () => {
      const response = { textStream: createReadableStream(['Fine']) };
      Object.defineProperty(response, 'error', {
        get() {
          throw new Error('not available');
        },
      });

      await pipeAgentResponse(response, {
        conversationDbId: 1,
        conversationId: 'conv_1',
        req: mockReq,
        res: mockRes,
        prisma: mockPrisma,
        logger: mockLogger,
      });

      expect(mockPrisma.conversationMessage.create).toHaveBeenCalled();
    });

    it('before anything was sent: answers the error envelope instead of a frame', async () => {
      mockRes.headersSent = false;
      mockRes.removeHeader = jest.fn();
      mockRes.status = jest.fn().mockReturnValue(mockRes);
      mockRes.json = jest.fn();
      mockReq.url = '/api/v1/conversations/conv_1/resume';
      mockReq.method = 'POST';

      await pipeAgentResponse(
        { textStream: failingStream([], new Error('boom')) },
        {
          conversationDbId: 1,
          conversationId: 'conv_1',
          req: mockReq,
          res: mockRes,
          prisma: mockPrisma,
          logger: mockLogger,
        },
      );

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 500, code: 'INTERNAL' }));
      expect(mockRes.write).not.toHaveBeenCalled();
    });
  });

  it('sets streaming headers', async () => {
    const response = {
      textStream: createReadableStream([]),
    };

    await pipeAgentResponse(response, {
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

    await pipeAgentResponse(response, {
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
    const text = 'Answer.\n\n<followups>\nWhat items are active?\nCheck system status\n</followups>';
    const response = {
      textStream: createReadableStream([text]),
    };

    await pipeAgentResponse(response, {
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
      card: { type: 'summary', data: { items: 5 } },
    };

    await pipeAgentResponse(response, {
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

    await pipeAgentResponse(response, {
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

    await pipeAgentResponse(response, {
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

    await pipeAgentResponse(response, {
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

    await originalPipe(response, {
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

    await pipeAgentResponse(response, {
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
