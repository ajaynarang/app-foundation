import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { Job } from 'bullmq';
import type { JobEnvelope } from '@sally/shared-types';
import { DOCUMENTS_JOB_NAMES } from '../../../../infrastructure/queue/queue.constants';
import type { QueueJobHandler } from '../../../../infrastructure/queue/job-handler.contract';
import { RateconParserService, isExtractionSentinel } from './ratecon-parser.service';
import { JobService } from '../../../../infrastructure/queue/job.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { LoadsService } from '../../../fleet/loads/services/loads.service';
import { CustomersService } from '../../../fleet/customers/services/customers.service';
import { FileStorageService } from '../../../../infrastructure/storage/file-storage.service';
import { DocumentsService } from '../../../fleet/documents/services/documents.service';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';
import { DOCUMENT_TYPES, normalizeTimeString } from '@sally/shared-types';
import type { RateconData, ParsingMetadata } from './ratecon.schema';
import { realFacilityName } from './real-facility-name';

interface RateconJobData {
  jobId: number;
  tenantId: number;
  submittedByUserId: string;
  submittedByDbId: number;
  fileName: string;
  s3Key?: string;
  fileBase64?: string; // Deprecated — kept for backwards compat with old jobs
  strategy: 'text-first' | 'vision';
  inputHash: string;
  forceReparse: boolean;
}

/**
 * Owns the `ratecon` job name on the `documents` queue. A plain handler (not a
 * `WorkerHost`) — the single {@link DocumentsQueueProcessor} dispatcher routes
 * jobs to it by name, so there is no competing-consumer race and no per-handler
 * job-name guard or dead-letter wiring (the dispatcher owns both).
 */
@Injectable()
export class RateconJobHandler implements QueueJobHandler {
  readonly jobNames = [DOCUMENTS_JOB_NAMES.RATECON];
  private readonly logger = new Logger(RateconJobHandler.name);

  constructor(
    private readonly rateconParser: RateconParserService,
    private readonly documentJobService: JobService,
    private readonly prisma: PrismaService,
    private readonly loadsService: LoadsService,
    private readonly customersService: CustomersService,
    private readonly fileStorage: FileStorageService,
    private readonly documentsService: DocumentsService,
    private readonly events: DomainEventService,
  ) {}

  async run(job: Job<JobEnvelope<RateconJobData>>): Promise<any> {
    const payload = job.data.payload;
    const { jobId, tenantId, fileName, fileBase64, strategy = 'text-first', inputHash, forceReparse } = payload;
    let { s3Key } = payload;

    // Skip if tenant has paused jobs
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { jobsPaused: true },
    });
    if (tenant?.jobsPaused) {
      this.logger.log(`Skipping ratecon job — tenant ${tenantId} is paused`);
      return { skipped: 'tenant_paused' };
    }

    this.logger.log(
      `Processing ratecon job ${jobId}: ${fileName} (strategy: ${strategy}, s3Key: ${s3Key ? 'present' : 'missing'}, fileBase64: ${fileBase64 ? 'present' : 'missing'})`,
    );

    // Fallback: if BullMQ payload is missing s3Key (e.g. stale Redis job),
    // look it up from the DB job record's inputData
    if (!s3Key && !fileBase64 && jobId) {
      this.logger.warn(`Job ${jobId}: BullMQ payload missing file data, checking DB inputData`);
      const dbJob = await this.documentJobService.getJob(jobId);
      const inputData = dbJob?.inputData as Record<string, any> | undefined;
      if (inputData?.s3Key) {
        s3Key = inputData.s3Key;
        this.logger.log(`Job ${jobId}: recovered s3Key from DB: ${s3Key}`);
      }
    }

    if (!s3Key && !fileBase64) {
      this.logger.error(`Job ${jobId}: no file data — received keys: ${Object.keys(payload).join(', ')}`);
      await this.documentJobService.markFailed(
        jobId,
        'File data not available for processing. Please re-upload the rate confirmation.',
      );
      return;
    }

    await this.documentJobService.markProcessing(jobId);

    try {
      // Step 1: Get parsed data — from cache or AI
      const { parsedData, parsing, fileBuffer } = await this.getParsedData(
        s3Key,
        fileBase64,
        fileName,
        tenantId,
        inputHash,
        forceReparse,
        strategy,
        jobId,
      );

      // Step 2: Always create a new draft load
      const load = await this.createDraftLoad(tenantId, jobId, fileName, parsedData);

      // Step 2.5: Store original PDF in S3 and create document record
      await this.storeRateConDocument(tenantId, load.id, fileName, fileBuffer);

      // Step 3: Mark job completed with result
      await this.documentJobService.markCompleted(jobId, {
        parsedData,
        loadNumber: load.loadNumber,
        parsing,
      });

      // Step 4: Notify via domain event → SSE bridge
      await this.events.emit(SALLY_EVENTS.RATECON_COMPLETED, tenantId, {
        entityId: jobId,
        entityType: 'ratecon',
        jobId,
        loadNumber: load.loadNumber,
        fileName,
      });

      this.logger.log(`Ratecon job ${jobId} completed: load ${load.loadNumber}`);
      return { loadNumber: load.loadNumber };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Ratecon job ${jobId} failed: ${errorMessage}`);

      // Non-transient errors should fail immediately — no point retrying
      const isNonTransient =
        error instanceof BadRequestException ||
        errorMessage.includes('Customer is required') ||
        errorMessage.includes('not configured') ||
        errorMessage.includes('authentication failed');

      const maxAttempts = job.opts?.attempts ?? 2;
      const isFinalAttempt = isNonTransient || job.attemptsMade >= maxAttempts - 1;

      if (isFinalAttempt) {
        await this.documentJobService.markFailed(jobId, errorMessage, {
          stack: error instanceof Error ? error.stack : undefined,
        });

        await this.events.emit(SALLY_EVENTS.RATECON_FAILED, tenantId, {
          entityId: jobId,
          entityType: 'ratecon',
          jobId,
          fileName,
          errorMessage,
        });

        // For non-transient errors, discard remaining retries
        if (isNonTransient) {
          job.discard();
          this.logger.log(`Ratecon job ${jobId} discarded — non-transient error`);
          return;
        }
      } else {
        // Reset DB status to queued so the frontend doesn't show stale "processing"
        await this.documentJobService.markQueued(jobId);
        this.logger.log(`Ratecon job ${jobId} will retry (attempt ${job.attemptsMade + 1}/${maxAttempts})`);
      }

      throw error;
    }
  }

  /**
   * Cache check: if a previous job with the same inputHash completed
   * successfully, reuse its parsedData (skip AI). Otherwise run AI.
   * This saves AI cost on duplicate PDFs while still creating fresh loads.
   */
  private async getParsedData(
    s3Key: string | undefined,
    fileBase64: string | undefined,
    fileName: string,
    tenantId: number,
    inputHash: string,
    forceReparse: boolean,
    strategy: 'text-first' | 'vision',
    jobId: number,
  ): Promise<{
    parsedData: RateconData;
    parsing: ParsingMetadata;
    fileBuffer: Buffer;
  }> {
    // Download file buffer once — reused for both AI parsing and document storage
    let fileBuffer: Buffer;
    if (s3Key) {
      fileBuffer = await this.fileStorage.downloadBuffer(s3Key);
    } else {
      fileBuffer = Buffer.from(fileBase64, 'base64');
    }

    if (!forceReparse && inputHash) {
      const cached = await this.documentJobService.findCompletedByHash(tenantId, 'documents', 'ratecon', inputHash);
      if (cached?.resultData) {
        const result = cached.resultData as Record<string, any>;
        if (result.parsedData) {
          // SQ-107 defense-in-depth: don't reuse a cached result that contains
          // sentinel placeholders. Those were written by the pre-fix parser
          // (PR #738) and re-serving them defeats the guardrail. Re-parse
          // instead so the fresh extraction path applies the latest fix.
          const cachedParsed = result.parsedData as RateconData;
          if (isExtractionSentinel(cachedParsed.load_number) || isExtractionSentinel(cachedParsed.broker_name)) {
            this.logger.warn(
              `Cache hit for ${fileName} (hash: ${inputHash.slice(0, 8)}…) but cached result has sentinel value(s) ` +
                `(load_number=${JSON.stringify(cachedParsed.load_number)}, broker_name=${JSON.stringify(cachedParsed.broker_name)}). ` +
                `Skipping cache and re-parsing.`,
            );
          } else {
            this.logger.log(`Cache hit for ${fileName} (hash: ${inputHash.slice(0, 8)}…), skipping AI`);
            return {
              parsedData: cachedParsed,
              parsing: (result.parsing as ParsingMetadata) || {
                requestedStrategy: strategy,
                actualStrategy: strategy,
                fallbackUsed: false,
                fallbackReason: null,
                textExtractionChars: null,
                model: 'cached',
                durationMs: 0,
              },
              fileBuffer,
            };
          }
        }
      }
    }

    this.logger.log(`Cache miss for ${fileName}, running AI parse (strategy: ${strategy})`);

    const result = await this.rateconParser.parse(fileBuffer, fileName, strategy, {
      tenantId,
      // `inputHash` doubles as a stable identifier for this parse attempt
      // (same PDF bytes → same hash → same linkRefId), which keeps the
      // ledger joinable across re-parses of the same upload.
      linkRefId: inputHash || undefined,
      // `jobId` discriminates the idempotency key. It's stable across BullMQ
      // retries of THIS job (so a retried model call dedupes) but distinct for
      // a user-initiated reprocess (forceReparse → a new document job → new
      // jobId), so a deliberate re-parse of identical bytes is billed as a new
      // ledger row instead of silently collapsing onto the prior cost.
      attemptId: String(jobId),
    });
    return { parsedData: result.data, parsing: result.parsing, fileBuffer };
  }

  /**
   * Find existing customer by MC number or company name, or create a new one.
   * Returns the DB id of the matched/created customer.
   */
  private async findOrCreateCustomer(tenantId: number, brokerName: string, brokerMc?: string): Promise<number> {
    // Try matching by MC number first (most reliable)
    if (brokerMc) {
      const byMc = await this.prisma.customer.findFirst({
        where: { tenantId, mcNumber: brokerMc },
        select: { id: true },
      });
      if (byMc) {
        this.logger.log(`Matched customer by MC# ${brokerMc}: id=${byMc.id}`);
        return byMc.id;
      }
    }

    // Try exact company name match
    const byName = await this.prisma.customer.findFirst({
      where: { tenantId, companyName: brokerName },
      select: { id: true },
    });
    if (byName) {
      this.logger.log(`Matched customer by name "${brokerName}": id=${byName.id}`);
      return byName.id;
    }

    // No match — create new customer as BROKER type
    const created = await this.customersService.create({
      tenantId,
      companyName: brokerName,
      customerType: 'BROKER',
      mcNumber: brokerMc || undefined,
      notes: 'Auto-created from rate confirmation import',
    });
    this.logger.log(`Created new customer "${brokerName}": id=${created.id}`);
    return created.id;
  }

  private async createDraftLoad(tenantId: number, jobId: number, fileName: string, parsedData: RateconData) {
    // Find or create customer from broker info
    const customerId = await this.findOrCreateCustomer(tenantId, parsedData.broker_name, parsedData.broker_mc);

    const stops = parsedData.stops.map((s, i) => ({
      stopId: `STOP-IMPORT-${Date.now()}-${i}`,
      sequenceOrder: s.sequence,
      actionType: s.action_type,
      appointmentDate: s.appointment_date || undefined,
      earliestArrival: normalizeTimeString(s.appointment_time) || undefined,
      estimatedDockHours: 2,
      name: realFacilityName(s.facility_name),
      address: s.address || '',
      city: s.city || '',
      state: s.state || '',
      zipCode: s.zip_code || '',
    }));

    return this.loadsService.create({
      tenantId,
      status: 'DRAFT',
      weightLbs: parsedData.weight_lbs || 0,
      commodityType: parsedData.commodity || 'General Freight',
      specialRequirements: parsedData.special_instructions || undefined,
      customerName: parsedData.broker_name,
      customerId,
      equipmentType: parsedData.equipment_type || undefined,
      referenceNumber: parsedData.load_number || undefined,
      rateCents: parsedData.rate_total_usd ? Math.round(parsedData.rate_total_usd * 100) : undefined,
      pieces: parsedData.pieces || undefined,
      intakeSource: 'import',
      intakeMetadata: {
        jobId,
        source_file: fileName,
        parsed_at: new Date().toISOString(),
        broker_name: parsedData.broker_name,
        broker_mc: parsedData.broker_mc,
        original_load_number: parsedData.load_number,
        confidence: parsedData.confidence ?? null,
      },
      stops,
    });
  }

  private async storeRateConDocument(
    tenantId: number,
    loadDbId: number,
    fileName: string,
    pdfBuffer: Buffer,
  ): Promise<void> {
    try {
      const loadS3Key = this.fileStorage.generateS3Key({
        tenantId,
        entityType: 'load',
        entityId: loadDbId,
        fileName,
      });
      await this.fileStorage.uploadBuffer(loadS3Key, pdfBuffer, 'application/pdf');

      await this.documentsService.createConfirmed({
        tenantId,
        entityType: 'load',
        entityId: loadDbId,
        documentType: 'rate_confirmation' satisfies keyof typeof DOCUMENT_TYPES,
        fileName,
        s3Key: loadS3Key,
        fileSize: pdfBuffer.length,
        mimeType: 'application/pdf',
      });

      this.logger.log(`Stored rate confirmation in S3 for load ${loadDbId}`);
    } catch (error) {
      this.logger.warn(`Failed to store rate confirmation in S3: ${(error as Error).message}`);
    }
  }
}
