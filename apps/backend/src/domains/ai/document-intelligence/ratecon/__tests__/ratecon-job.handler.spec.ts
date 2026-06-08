// Mock the parser service module to avoid transitive @mastra/core ESM import
jest.mock('../ratecon-parser.service', () => ({
  RateconParserService: jest.fn().mockImplementation(() => ({
    parse: jest.fn(),
  })),
  // Re-export the sentinel detector with the real semantics — the processor
  // calls this to decide whether to bypass a poisoned cache (SQ-107).
  isExtractionSentinel: (value: string | undefined | null): boolean => {
    if (value == null) return true;
    const normalized = value.trim().toLowerCase();
    if (
      ['', '<unknown>', 'unknown', '__unreadable__', '<not_found>', 'not_found', 'n/a', 'na', 'null', 'none'].includes(
        normalized,
      )
    ) {
      return true;
    }
    if (/^[<\[].*[>\]]$/.test(normalized)) return true;
    return false;
  },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { RateconJobHandler } from '../ratecon-job.handler';
import { RateconParserService } from '../ratecon-parser.service';
import { JobService } from '../../../../../infrastructure/queue/job.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { LoadsService } from '../../../../fleet/loads/services/loads.service';
import { CustomersService } from '../../../../fleet/customers/services/customers.service';
import { FileStorageService } from '../../../../../infrastructure/storage/file-storage.service';
import { DocumentsService } from '../../../../fleet/documents/services/documents.service';
import { DomainEventService } from '../../../../../infrastructure/events/domain-event.service';
import { DOCUMENTS_JOB_NAMES } from '../../../../../infrastructure/queue/queue.constants';
import { BadRequestException } from '@nestjs/common';

describe('RateconJobHandler', () => {
  let processor: RateconJobHandler;

  const mockRateconParser = {
    parse: jest.fn(),
  };

  const mockJobService = {
    getJob: jest.fn(),
    markProcessing: jest.fn(),
    markCompleted: jest.fn(),
    markFailed: jest.fn(),
    markQueued: jest.fn(),
    findCompletedByHash: jest.fn(),
  };

  const mockPrisma = {
    tenant: { findUnique: jest.fn() },
    customer: { findFirst: jest.fn() },
  };

  const mockLoadsService = {
    create: jest.fn(),
  };

  const mockCustomersService = {
    create: jest.fn(),
  };

  const mockFileStorage = {
    downloadBuffer: jest.fn(),
    uploadBuffer: jest.fn(),
    generateS3Key: jest.fn(),
  };

  const mockDocumentsService = {
    createConfirmed: jest.fn(),
  };

  const mockEventEmitter = {
    emit: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateconJobHandler,
        { provide: RateconParserService, useValue: mockRateconParser },
        { provide: JobService, useValue: mockJobService },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: LoadsService, useValue: mockLoadsService },
        { provide: CustomersService, useValue: mockCustomersService },
        { provide: FileStorageService, useValue: mockFileStorage },
        { provide: DocumentsService, useValue: mockDocumentsService },
        { provide: DomainEventService, useValue: mockEventEmitter },
      ],
    }).compile();

    processor = module.get<RateconJobHandler>(RateconJobHandler);
  });

  afterEach(() => jest.clearAllMocks());

  // Build a job whose `data` is the standard JobEnvelope wrapping the given
  // payload — every producer wraps payloads with buildJobEnvelope.
  const createJob = (payload: any, opts: any = {}) =>
    ({
      name: DOCUMENTS_JOB_NAMES.RATECON,
      data: {
        tenantId: '1',
        correlationId: 'corr-1',
        payload,
        metadata: { enqueuedAt: '2026-05-27T00:00:00.000Z', source: 'api', version: 1 },
      },
      opts: { attempts: 2, ...opts },
      attemptsMade: 0,
      discard: jest.fn(),
    }) as any;

  describe('run', () => {
    const baseJobData = {
      jobId: 'JOB-1',
      tenantId: 1,
      submittedByUserId: 'user-1',
      submittedByDbId: 1,
      fileName: 'ratecon.pdf',
      s3Key: 'uploads/ratecon.pdf',
      strategy: 'text-first' as const,
      inputHash: 'hash123',
      forceReparse: false,
    };

    it('should skip if tenant is paused', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ jobsPaused: true });

      const result = await processor.run(createJob(baseJobData));
      expect(result).toEqual({ skipped: 'tenant_paused' });
      expect(mockJobService.markProcessing).not.toHaveBeenCalled();
    });

    it('should process ratecon and create draft load', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ jobsPaused: false });
      mockFileStorage.downloadBuffer.mockResolvedValue(Buffer.from('pdf'));
      mockJobService.findCompletedByHash.mockResolvedValue(null);
      mockRateconParser.parse.mockResolvedValue({
        data: {
          broker_name: 'ABC Logistics',
          broker_mc: 'MC-123',
          stops: [
            {
              sequence: 1,
              action_type: 'pickup',
              facility_name: 'Warehouse A',
              city: 'Dallas',
              state: 'TX',
            },
          ],
          rate_total_usd: 2500,
          load_number: 'REF-001',
          equipment_type: 'dry_van',
          commodity: 'Freight',
          weight_lbs: 40000,
          confidence: 0.95,
        },
        parsing: {
          requestedStrategy: 'text-first',
          actualStrategy: 'text-first',
          fallbackUsed: false,
          model: 'gpt-4o',
          durationMs: 3000,
        },
      });
      mockPrisma.customer.findFirst.mockResolvedValue({ id: 5 });
      mockLoadsService.create.mockResolvedValue({
        id: 10,
        loadNumber: 'L001',
      });
      mockFileStorage.generateS3Key.mockReturnValue('loads/ratecon.pdf');

      const result = await processor.run(createJob(baseJobData));

      expect(mockJobService.markProcessing).toHaveBeenCalledWith('JOB-1');
      expect(mockLoadsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 1,
          status: 'DRAFT',
          customerName: 'ABC Logistics',
        }),
      );
      expect(mockJobService.markCompleted).toHaveBeenCalledWith(
        'JOB-1',
        expect.objectContaining({ loadNumber: 'L001' }),
      );
      expect(mockEventEmitter.emit).toHaveBeenCalled();
      expect(result).toEqual({ loadNumber: 'L001' });
    });

    it('should use cached parsed data on hash match', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ jobsPaused: false });
      mockFileStorage.downloadBuffer.mockResolvedValue(Buffer.from('pdf'));
      mockJobService.findCompletedByHash.mockResolvedValue({
        resultData: {
          parsedData: {
            load_number: 'REAL-LOAD-001',
            broker_name: 'Cached Broker',
            stops: [],
          },
          parsing: { model: 'cached' },
        },
      });
      mockPrisma.customer.findFirst.mockResolvedValue({ id: 5 });
      mockLoadsService.create.mockResolvedValue({
        id: 10,
        loadNumber: 'L002',
      });
      mockFileStorage.generateS3Key.mockReturnValue('loads/ratecon.pdf');

      await processor.run(createJob(baseJobData));

      expect(mockRateconParser.parse).not.toHaveBeenCalled();
      expect(mockLoadsService.create).toHaveBeenCalled();
    });

    // SQ-107 defense-in-depth: cache poisoning happened on staging when QA
    // uploaded a PDF before the parser fix (pre-#738), the failed extraction
    // wrote <UNKNOWN> placeholders into resultData.parsedData, and every
    // re-upload of the same PDF hit the cache and short-circuited the new
    // detector + guardrail. Fix: cached results with sentinel required fields
    // are treated as cache miss and re-parsed.
    it('should bypass cache and re-parse when cached parsedData has sentinel values', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ jobsPaused: false });
      mockFileStorage.downloadBuffer.mockResolvedValue(Buffer.from('pdf'));
      mockJobService.findCompletedByHash.mockResolvedValue({
        resultData: {
          parsedData: {
            load_number: '<UNKNOWN>',
            broker_name: '<UNKNOWN>',
            rate_total_usd: 0,
            stops: [],
          },
          parsing: { model: 'standard', actualStrategy: 'text-first' },
        },
      });
      mockRateconParser.parse.mockResolvedValue({
        data: {
          load_number: 'REAL-0287095',
          broker_name: 'Ready2Xecute',
          rate_total_usd: 1600,
          stops: [
            { sequence: 1, action_type: 'pickup', facility_name: 'Pickup', city: 'A', state: 'TX' },
            { sequence: 2, action_type: 'delivery', facility_name: 'Delivery', city: 'B', state: 'TX' },
          ],
        },
        parsing: {
          requestedStrategy: 'text-first',
          actualStrategy: 'vision',
          fallbackUsed: true,
          fallbackReason: 'text_extraction_too_short',
          textExtractionChars: 96,
          model: 'standard',
          durationMs: 1234,
        },
      });
      mockPrisma.customer.findFirst.mockResolvedValue({ id: 5 });
      mockLoadsService.create.mockResolvedValue({ id: 11, loadNumber: 'L003' });
      mockFileStorage.generateS3Key.mockReturnValue('loads/ratecon.pdf');

      await processor.run(createJob(baseJobData));

      // Parser MUST be called — cache was poisoned and must not short-circuit.
      expect(mockRateconParser.parse).toHaveBeenCalled();
      // The fresh result (not the cached sentinel) should be what got passed to
      // the load creator.
      expect(mockLoadsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          referenceNumber: 'REAL-0287095',
          customerName: 'Ready2Xecute',
        }),
      );
    });

    it('should fail job when no file data is available', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ jobsPaused: false });
      mockJobService.getJob.mockResolvedValue(null);

      const jobData = {
        ...baseJobData,
        s3Key: undefined,
        fileBase64: undefined,
      };
      await processor.run(createJob(jobData));

      expect(mockJobService.markFailed).toHaveBeenCalledWith(
        'JOB-1',
        expect.stringContaining('File data not available'),
      );
    });

    it('should mark failed on final attempt error', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ jobsPaused: false });
      mockFileStorage.downloadBuffer.mockResolvedValue(Buffer.from('pdf'));
      mockJobService.findCompletedByHash.mockResolvedValue(null);
      mockRateconParser.parse.mockRejectedValue(new Error('AI parse failed'));

      const job = createJob(baseJobData);
      job.attemptsMade = 1; // final attempt (attempts=2, attemptsMade >= 2-1)

      await expect(processor.run(job)).rejects.toThrow('AI parse failed');
      expect(mockJobService.markFailed).toHaveBeenCalledWith('JOB-1', 'AI parse failed', expect.any(Object));
      expect(mockEventEmitter.emit).toHaveBeenCalled();
    });

    it('should discard non-transient errors immediately', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ jobsPaused: false });
      mockFileStorage.downloadBuffer.mockResolvedValue(Buffer.from('pdf'));
      mockJobService.findCompletedByHash.mockResolvedValue(null);
      mockRateconParser.parse.mockRejectedValue(new BadRequestException('Customer is required'));

      const job = createJob(baseJobData);
      job.attemptsMade = 0;

      await processor.run(job);

      expect(job.discard).toHaveBeenCalled();
      expect(mockJobService.markFailed).toHaveBeenCalled();
    });

    it('should reset to queued on non-final retry', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ jobsPaused: false });
      mockFileStorage.downloadBuffer.mockResolvedValue(Buffer.from('pdf'));
      mockJobService.findCompletedByHash.mockResolvedValue(null);
      mockRateconParser.parse.mockRejectedValue(new Error('Temporary'));

      const job = createJob(baseJobData);
      job.attemptsMade = 0;
      job.opts.attempts = 3;

      await expect(processor.run(job)).rejects.toThrow('Temporary');
      expect(mockJobService.markQueued).toHaveBeenCalledWith('JOB-1');
    });

    // Job-name routing and dead-letter persistence now live in the single
    // DocumentsQueueProcessor dispatcher (see documents-queue.processor.spec.ts),
    // not on this handler — so there is no name-guard or onFailed test here.
    it('exposes the RATECON job name so the dispatcher can route to it', () => {
      expect(processor.jobNames).toContain(DOCUMENTS_JOB_NAMES.RATECON);
    });
  });
});
