// Mock mastra modules that cause ESM issues in Jest
jest.mock('../../../../domains/ai/assistant/mastra/mastra.provider', () => ({}));
jest.mock('../../../../domains/ai/infrastructure/providers/structured-output.service', () => ({
  StructuredOutputService: jest.fn(),
}));
jest.mock('../../../ai/document-intelligence/ratecon/ratecon-parser.service', () => ({
  RateconParserService: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { EmailIntakeJobHandler } from '../processors/email-intake-job.handler';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { FileStorageService } from '../../../../infrastructure/storage/file-storage.service';
import { RateconParserService } from '../../../ai/document-intelligence/ratecon/ratecon-parser.service';
import { EmailThreadTrackerService } from '../services/email-thread-tracker.service';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { NotificationService } from '../../../../infrastructure/notification/notification.service';
import { DOCUMENTS_JOB_NAMES } from '../../../../infrastructure/queue/queue.constants';
import { DOMAIN_EVENTS } from '../../../../infrastructure/events/sally-events.constants';

const mockPrisma = {
  emailIngestAttachment: { update: jest.fn() },
  emailIngestThread: { findUnique: jest.fn() },
  notification: { create: jest.fn() },
};

const mockFileStorage = {
  downloadBuffer: jest.fn().mockResolvedValue(Buffer.from('PDF content')),
};

const mockRateconParser = {
  parse: jest.fn().mockResolvedValue({
    data: {
      load_number: 'LOAD-123',
      broker_name: 'Acme Freight',
      rate_total_usd: 2500.0,
      stops: [
        {
          city: 'Dallas',
          state: 'TX',
          sequence: 1,
          action_type: 'pickup',
          location: 'high',
          date: 'high',
        },
        {
          city: 'Houston',
          state: 'TX',
          sequence: 2,
          action_type: 'delivery',
          location: 'medium',
          date: 'low',
        },
      ],
      confidence: {
        reference_number: 'high',
        broker_name: 'high',
        rate: 'medium',
        stops: [
          { location: 'high', date: 'high' },
          { location: 'medium', date: 'low' },
        ],
      },
    },
  }),
};

const mockThreadTracker = {
  handleRevision: jest.fn(),
};

const mockEventEmitter = { emit: jest.fn().mockResolvedValue(undefined) };

const mockNotificationService = {};

// Build a job whose `data` is the standard JobEnvelope wrapping the
// attachment payload — every producer wraps payloads with buildJobEnvelope.
function makeJob(overrides: Partial<any> = {}) {
  return {
    name: overrides.name ?? DOCUMENTS_JOB_NAMES.PARSE_ATTACHMENT,
    data: {
      tenantId: '1',
      correlationId: 'corr-1',
      payload: {
        tenantId: 1,
        threadId: 'thread-1',
        messageId: 'msg-1',
        attachmentId: 'att-1',
        s3Key: 'emails/att-1.pdf',
        fileName: 'ratecon.pdf',
        contentHash: 'hash123',
      },
      metadata: { enqueuedAt: '2026-05-27T00:00:00.000Z', source: 'webhook', version: 1 },
    },
    attemptsMade: overrides.attemptsMade ?? 0,
    opts: { attempts: overrides.maxAttempts ?? 2 },
  } as any;
}

describe('EmailIntakeJobHandler', () => {
  let processor: EmailIntakeJobHandler;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.emailIngestThread.findUnique.mockResolvedValue({
      senderEmail: 'broker@example.com',
    });
    mockPrisma.notification.create.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailIntakeJobHandler,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: FileStorageService, useValue: mockFileStorage },
        { provide: RateconParserService, useValue: mockRateconParser },
        {
          provide: EmailThreadTrackerService,
          useValue: mockThreadTracker,
        },
        { provide: DomainEventService, useValue: mockEventEmitter },
        { provide: NotificationService, useValue: mockNotificationService },
      ],
    }).compile();

    processor = module.get<EmailIntakeJobHandler>(EmailIntakeJobHandler);
  });

  // --------------------------------------------------------------------------
  // Happy path
  // --------------------------------------------------------------------------

  describe('process — success', () => {
    it('should download, parse, update attachment, handle revision, notify, and emit event', async () => {
      const result = await processor.run(makeJob());

      // Step 1: Download
      expect(mockFileStorage.downloadBuffer).toHaveBeenCalledWith('emails/att-1.pdf');

      // Step 2: Parse — aiContext (tenantId + linkRefId) added in the AI
      // cost telemetry wiring; spec keeps the original assertions intact.
      expect(mockRateconParser.parse).toHaveBeenCalledWith(
        expect.any(Buffer),
        'ratecon.pdf',
        'text-first',
        expect.objectContaining({ tenantId: expect.any(Number), linkRefId: expect.any(String) }),
      );

      // Step 3: Update attachment to PARSED
      expect(mockPrisma.emailIngestAttachment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'att-1' },
          data: expect.objectContaining({
            parseStatus: 'PARSED',
            parsedLoadNumber: 'LOAD-123',
          }),
        }),
      );

      // Step 4: Handle revision
      expect(mockThreadTracker.handleRevision).toHaveBeenCalledWith({
        threadId: 'thread-1',
        attachmentId: 'att-1',
        loadNumber: 'LOAD-123',
      });

      // Step 5: Notification
      expect(mockPrisma.notification.create).toHaveBeenCalled();

      // Step 6: Event
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        DOMAIN_EVENTS.EMAIL_INGEST_PARSED,
        expect.any(Number),
        expect.objectContaining({
          threadId: 'thread-1',
          loadNumber: 'LOAD-123',
        }),
      );

      // Return value
      expect(result).toEqual({
        attachmentId: 'att-1',
        loadNumber: 'LOAD-123',
        confidence: expect.any(Number),
      });
    });

    it('should skip revision handling when no load number parsed', async () => {
      mockRateconParser.parse.mockResolvedValueOnce({
        data: {
          load_number: null,
          broker_name: 'Unknown',
          rate_total_usd: null,
          stops: [],
          confidence: {
            reference_number: 'low',
            broker_name: 'low',
            rate: 'low',
            stops: [],
          },
        },
      });

      await processor.run(makeJob());

      expect(mockThreadTracker.handleRevision).not.toHaveBeenCalled();
    });

    it('should not fail if notification creation fails', async () => {
      mockPrisma.notification.create.mockRejectedValueOnce(new Error('DB error'));

      // Should not throw
      const result = await processor.run(makeJob());
      expect(result.attachmentId).toBe('att-1');
    });
  });

  // --------------------------------------------------------------------------
  // Error handling
  // --------------------------------------------------------------------------

  describe('process — error handling', () => {
    it('should mark FAILED and emit event on final attempt', async () => {
      mockRateconParser.parse.mockRejectedValueOnce(new Error('Parse error'));

      const job = makeJob({ attemptsMade: 1, maxAttempts: 2 });

      await expect(processor.run(job)).rejects.toThrow('Parse error');

      expect(mockPrisma.emailIngestAttachment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { parseStatus: 'FAILED' },
        }),
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        DOMAIN_EVENTS.EMAIL_INGEST_FAILED,
        expect.any(Number),
        expect.objectContaining({
          threadId: 'thread-1',
          errorMessage: 'Parse error',
        }),
      );
    });

    it('should not mark FAILED on non-final attempt', async () => {
      mockRateconParser.parse.mockRejectedValueOnce(new Error('Temporary error'));

      const job = makeJob({ attemptsMade: 0, maxAttempts: 2 });

      await expect(processor.run(job)).rejects.toThrow();

      // update called once for PARSING status, but NOT for FAILED
      const failedCalls = mockPrisma.emailIngestAttachment.update.mock.calls.filter(
        (c: any) => c[0]?.data?.parseStatus === 'FAILED',
      );
      expect(failedCalls).toHaveLength(0);
    });

    it('should mark PARSING status before starting', async () => {
      mockRateconParser.parse.mockRejectedValueOnce(new Error('fail'));

      try {
        await processor.run(makeJob());
      } catch {
        // expected
      }

      expect(mockPrisma.emailIngestAttachment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { parseStatus: 'PARSING' },
        }),
      );
    });
  });

  // --------------------------------------------------------------------------
  // Notification content
  // --------------------------------------------------------------------------

  describe('notification content', () => {
    it('should build notification with rate and route', async () => {
      await processor.run(makeJob());

      const createCall = mockPrisma.notification.create.mock.calls[0][0];
      expect(createCall.data.title).toContain('$2,500');
      expect(createCall.data.message).toContain('Dallas, TX');
      expect(createCall.data.message).toContain('Houston, TX');
      expect(createCall.data.message).toContain('broker@example.com');
    });

    it('should handle notification with no rate', async () => {
      mockRateconParser.parse.mockResolvedValueOnce({
        data: {
          load_number: 'L1',
          broker_name: 'B',
          rate_total_usd: null,
          stops: [],
          confidence: {
            reference_number: 'low',
            broker_name: 'low',
            rate: 'low',
            stops: [],
          },
        },
      });

      await processor.run(makeJob());

      const createCall = mockPrisma.notification.create.mock.calls[0][0];
      expect(createCall.data.title).toBe('Rate-con parsed');
    });
  });

  // --------------------------------------------------------------------------
  // Shared-queue dispatch (Phase 3 queue-topology)
  // --------------------------------------------------------------------------

  // Job-name routing and dead-letter persistence now live in the single
  // DocumentsQueueProcessor dispatcher (see documents-queue.processor.spec.ts),
  // not on this handler.
  describe('handler registration', () => {
    it('owns the PARSE_ATTACHMENT job name so the dispatcher can route to it', () => {
      expect(processor.jobNames).toContain(DOCUMENTS_JOB_NAMES.PARSE_ATTACHMENT);
    });
  });
});
