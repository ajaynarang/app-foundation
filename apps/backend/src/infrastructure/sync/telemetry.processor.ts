import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import type { JobEnvelope } from '@sally/shared-types';
import { PrismaService } from '../database/prisma.service';
import { JobService } from '../queue/job.service';
import { QUEUE_NAMES, TELEMETRY_JOB_NAMES } from '../queue/queue.constants';
import { DeadLetterService } from '../queue/dead-letter.service';
import { withJobLogContext } from '../logging/job-log-context';
import { DomainEventService } from '../events/domain-event.service';
import { SALLY_EVENTS } from '../events/sally-events.constants';
import { EldSyncService } from '../../domains/integrations/sync/eld-sync.service';
import { SyncActionLog } from './sync-action-log';
import { IntegrationSyncPayload, SyncResult } from './sync-job.types';

/**
 * Names this processor handles. Today TelemetryProcessor is the sole consumer
 * of the `telemetry` queue, but the guard makes us safe if a future processor
 * lands on the same queue.
 */
const OWNED_JOB_NAMES = new Set<string>([
  TELEMETRY_JOB_NAMES.HOS,
  TELEMETRY_JOB_NAMES.GPS,
  TELEMETRY_JOB_NAMES.DVIR,
  TELEMETRY_JOB_NAMES.FLEET_SYNC,
]);

/**
 * TelemetryProcessor — BullMQ worker for the `telemetry` queue.
 *
 * Handles ELD ingest jobs (`hos`, `gps`, `dvir`, `fleet-sync`). These are
 * real-time, safety-critical, and run with concurrency 5 because we need
 * them flowing even if a vendor data feed backs up.
 *
 * Split from the old combined SyncProcessor (FLEET_PIPELINE queue) as part
 * of the 2026-05-27 queue topology redesign — TMS data sync (`drivers`,
 * `vehicles`, `loads`) now lives in `VendorDataProcessor` under the
 * `vendor-data` queue.
 *
 * Permanent failures (attempts exhausted) are recorded via
 * `DeadLetterService` so they survive BullMQ's 7-day `failed` retention.
 */
@Processor(QUEUE_NAMES.TELEMETRY, { concurrency: 5 })
@Injectable()
export class TelemetryProcessor extends WorkerHost {
  private readonly logger = new Logger(TelemetryProcessor.name);

  constructor(
    private readonly jobService: JobService,
    private readonly prisma: PrismaService,
    private readonly eldSyncService: EldSyncService,
    private readonly events: DomainEventService,
    private readonly deadLetter: DeadLetterService,
  ) {
    super();
  }

  async process(bullJob: Job<JobEnvelope<IntegrationSyncPayload>>): Promise<SyncResult | void> {
    if (!OWNED_JOB_NAMES.has(bullJob.name)) return;
    return withJobLogContext(bullJob, async () => this.handle(bullJob));
  }

  private async handle(bullJob: Job<JobEnvelope<IntegrationSyncPayload>>): Promise<SyncResult> {
    const payload = bullJob.data.payload;
    const { type, tenantId, integrationId, triggerSource } = payload;

    // Skip if tenant has paused jobs
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { jobsPaused: true },
    });
    if (tenant?.jobsPaused) {
      this.logger.log(`Skipping telemetry job — tenant ${tenantId} is paused`);
      return {
        recordsProcessed: 0,
        recordsCreated: 0,
        recordsExisting: 0,
        details: { skipped: 'tenant_paused' },
      };
    }

    // For repeatable (cron) jobs, jobId is undefined — create one. For manual
    // jobs the producer pre-creates the Job row and passes the id.
    let jobId = payload.jobId;

    if (!jobId) {
      const job = await this.jobService.createJob({
        tenantId,
        submittedBy: null,
        category: 'telemetry',
        type,
        inputData: {
          integrationId,
          integrationName: payload.integrationName,
          integrationType: payload.integrationType,
          triggerSource,
        },
      });
      jobId = job.id;
    }

    this.logger.log(
      `Processing telemetry job ${jobId}: type=${type}, tenant=${tenantId}, integration=${integrationId}`,
    );

    await this.jobService.markProcessing(jobId);

    // Notify frontend that sync started
    await this.events.emit(
      SALLY_EVENTS.SYNC_STARTED,
      tenantId,
      {
        entityId: jobId,
        entityType: 'sync',
        jobId,
        type,
        integrationId,
        triggerSource,
      },
      { id: 'samsara-sync', type: 'integration', label: 'Samsara Sync' },
    );

    const startTime = Date.now();

    try {
      let result: SyncResult;

      switch (type) {
        case 'hos':
          result = await this.eldSyncService.syncHos(integrationId);
          break;
        case 'gps':
          result = await this.eldSyncService.syncTelematics(integrationId);
          break;
        case 'dvir': {
          const dvirResult = await this.eldSyncService.syncDVIRs(integrationId);
          result = {
            recordsProcessed: dvirResult.total,
            recordsCreated: dvirResult.created,
            recordsExisting: 0,
            details: {
              created: dvirResult.created,
              skipped: dvirResult.skipped,
              errors: dvirResult.errors,
              unmatchedItems: dvirResult.unmatchedItems,
            },
          };
          break;
        }
        case 'fleet-sync':
          result = await this.runEnrichment(integrationId);
          break;
        default:
          throw new BadRequestException(`Unknown telemetry sync type: ${String(type)}`);
      }

      const durationMs = Date.now() - startTime;

      await this.jobService.markCompleted(jobId, {
        ...result,
        durationMs,
      });

      // Update integration config with success
      await this.prisma.integrationConfig.update({
        where: { id: integrationId },
        data: {
          lastSuccessAt: new Date(),
          lastSyncAt: new Date(),
          lastErrorMessage: null,
        },
      });

      // Emit domain event — SSE bridge routes to frontend, webhooks dispatcher to outbound
      await this.events.emit(
        SALLY_EVENTS.SYNC_COMPLETED,
        tenantId,
        {
          entityId: jobId,
          entityType: 'sync',
          jobId,
          type,
          integrationId,
          ...result,
          durationMs,
        },
        { id: 'samsara-sync', type: 'integration', label: 'Samsara Sync' },
      );

      this.logger.log(`Telemetry job ${jobId} completed: ${result.recordsProcessed} processed in ${durationMs}ms`);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      const isNonRetryable = (error as { nonRetryable?: boolean })?.nonRetryable === true;

      const isFinalAttempt = isNonRetryable || bullJob.attemptsMade >= (bullJob.opts?.attempts ?? 3) - 1;

      if (isFinalAttempt) {
        await this.jobService.markFailed(jobId, errorMessage, {
          stack: errorStack,
          attempt: bullJob.attemptsMade + 1,
          nonRetryable: isNonRetryable,
        });

        await this.prisma.integrationConfig.update({
          where: { id: integrationId },
          data: {
            lastErrorAt: new Date(),
            lastErrorMessage: errorMessage,
          },
        });

        await this.events.emit(
          SALLY_EVENTS.SYNC_FAILED,
          tenantId,
          {
            entityId: jobId,
            entityType: 'sync',
            jobId,
            type,
            integrationId,
            error: errorMessage,
          },
          { id: 'samsara-sync', type: 'integration', label: 'Samsara Sync' },
        );
      }

      this.logger.error(
        `Telemetry job ${jobId} failed (attempt ${bullJob.attemptsMade + 1}${isNonRetryable ? ', non-retryable' : ''}): ${errorMessage}`,
      );

      if (isNonRetryable) {
        await bullJob.moveToFailed(
          error instanceof Error ? error : new Error(errorMessage),
          bullJob.token ?? '0',
          false,
        );
        return {
          recordsProcessed: 0,
          recordsCreated: 0,
          recordsExisting: 0,
          details: { error: errorMessage },
        };
      }

      throw error; // Bull retries
    }
  }

  /**
   * Run a full fleet sync (drivers + vehicles) for the given ELD integration.
   * Called for the `fleet-sync` job type.
   */
  private async runEnrichment(integrationId: number): Promise<SyncResult> {
    const log = new SyncActionLog();

    const driverResult = await this.eldSyncService.syncDrivers(integrationId);
    log.add(
      'driver_sync',
      `Drivers: ${driverResult.created} created, ${driverResult.enriched} enriched, ${driverResult.skipped} skipped`,
    );

    const vehicleResult = await this.eldSyncService.syncVehicles(integrationId);
    log.add(
      'vehicle_sync',
      `Vehicles: ${vehicleResult.created} created, ${vehicleResult.enriched} enriched, ${vehicleResult.skipped} skipped`,
    );

    return {
      recordsProcessed: driverResult.total + vehicleResult.total,
      recordsCreated: driverResult.created + vehicleResult.created,
      recordsExisting: driverResult.enriched + vehicleResult.enriched,
      details: { actions: log.toArray() },
    };
  }

  /**
   * Record permanent failures (attempts exhausted) in `dead_letter_logs` so
   * they survive Bull's 7-day failed-set retention.
   */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<JobEnvelope<IntegrationSyncPayload>>, err: Error): Promise<void> {
    if (!OWNED_JOB_NAMES.has(job.name)) return;
    if (job.attemptsMade >= (job.opts?.attempts ?? 1)) {
      await this.deadLetter.recordPermanentFailure(job, err);
    }
  }
}
