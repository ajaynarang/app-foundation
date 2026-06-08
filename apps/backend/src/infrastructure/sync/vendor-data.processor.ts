import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Job } from 'bullmq';
import type { JobEnvelope } from '@sally/shared-types';
import { PrismaService } from '../database/prisma.service';
import { JobService } from '../queue/job.service';
import { VENDOR_DATA_JOB_NAMES } from '../queue/queue.constants';
import type { QueueJobHandler } from '../queue/job-handler.contract';
import { VendorCircuitBreakerService } from '../queue/vendor-circuit-breaker.service';
import { withJobLogContext } from '../logging/job-log-context';
import { DomainEventService } from '../events/domain-event.service';
import { SALLY_EVENTS } from '../events/sally-events.constants';
import { TmsSyncService } from '../../domains/integrations/sync/tms-sync.service';
import { EldSyncService } from '../../domains/integrations/sync/eld-sync.service';
import { SyncActionLog } from './sync-action-log';
import { IntegrationSyncPayload, SyncResult } from './sync-job.types';

/**
 * Owns the TMS data sync jobs (`tms-drivers`, `tms-vehicles`, `tms-loads`) on the
 * `vendor-data` queue. A plain handler — the single VendorDataQueueProcessor
 * dispatcher routes by name. Concurrency (set on the dispatcher) is bounded to 3
 * because we are vendor-rate-limited; a per-vendor circuit breaker trips and
 * cools down a failing vendor so one bad vendor doesn't starve the others.
 *
 * Split from the old combined SyncProcessor (FLEET_PIPELINE queue) in the
 * 2026-05-27 queue topology redesign — ELD telemetry sync now lives in
 * `TelemetryProcessor` under the higher-SLA `telemetry` queue.
 */
@Injectable()
export class VendorDataJobHandler implements QueueJobHandler {
  readonly jobNames = [
    VENDOR_DATA_JOB_NAMES.TMS_DRIVERS,
    VENDOR_DATA_JOB_NAMES.TMS_VEHICLES,
    VENDOR_DATA_JOB_NAMES.TMS_LOADS,
  ];
  private readonly logger = new Logger(VendorDataJobHandler.name);

  constructor(
    private readonly jobService: JobService,
    private readonly prisma: PrismaService,
    private readonly tmsSyncService: TmsSyncService,
    private readonly eldSyncService: EldSyncService,
    private readonly events: DomainEventService,
    private readonly circuitBreaker: VendorCircuitBreakerService,
  ) {}

  async run(bullJob: Job<JobEnvelope<IntegrationSyncPayload>>): Promise<SyncResult | void> {
    return withJobLogContext(bullJob, async () => this.handle(bullJob));
  }

  private async handle(bullJob: Job<JobEnvelope<IntegrationSyncPayload>>): Promise<SyncResult> {
    const payload = bullJob.data.payload;
    const { type, tenantId, integrationId, triggerSource } = payload;
    const vendor = (payload.integrationName || 'unknown').toLowerCase();

    // Skip if tenant has paused jobs
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { jobsPaused: true },
    });
    if (tenant?.jobsPaused) {
      this.logger.log(`Skipping vendor-data job — tenant ${tenantId} is paused`);
      return {
        recordsProcessed: 0,
        recordsCreated: 0,
        recordsExisting: 0,
        details: { skipped: 'tenant_paused' },
      };
    }

    // Circuit breaker: if this vendor is currently OPEN, fast-fail so Bull
    // retries after the standard backoff. The circuit auto-closes after the
    // cooldown TTL on the Redis key.
    if (await this.circuitBreaker.isOpen(vendor)) {
      this.logger.warn(
        `Circuit open for vendor=${vendor}, deferring vendor-data job ${bullJob.id} (type=${type}, integration=${integrationId})`,
      );
      throw new Error(`Circuit breaker open for vendor: ${vendor}`);
    }

    // For repeatable (cron) jobs, jobId is undefined — create one. For manual
    // jobs the producer pre-creates the Job row and passes the id.
    let jobId = payload.jobId;

    if (!jobId) {
      const job = await this.jobService.createJob({
        tenantId,
        submittedBy: null,
        category: 'vendor',
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
      `Processing vendor-data job ${jobId}: type=${type}, tenant=${tenantId}, integration=${integrationId}, vendor=${vendor}`,
    );

    await this.jobService.markProcessing(jobId);

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
        case 'drivers':
          result = await this.syncDrivers(tenantId, integrationId);
          break;
        case 'vehicles':
          result = await this.syncVehicles(tenantId, integrationId);
          break;
        case 'loads':
          result = await this.syncLoads(integrationId);
          break;
        default:
          throw new BadRequestException(`Unknown vendor-data sync type: ${String(type)}`);
      }

      const durationMs = Date.now() - startTime;

      await this.jobService.markCompleted(jobId, {
        ...result,
        durationMs,
      });

      await this.prisma.integrationConfig.update({
        where: { id: integrationId },
        data: {
          lastSuccessAt: new Date(),
          lastSyncAt: new Date(),
          lastErrorMessage: null,
        },
      });

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

      // Reset the failure counter on this vendor.
      await this.circuitBreaker.recordSuccess(vendor);

      this.logger.log(`Vendor-data job ${jobId} completed: ${result.recordsProcessed} processed in ${durationMs}ms`);
      return result;
    } catch (error) {
      // Per-vendor failure accounting — may trip the breaker OPEN.
      await this.circuitBreaker.recordFailure(vendor);

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
        `Vendor-data job ${jobId} failed (attempt ${bullJob.attemptsMade + 1}${isNonRetryable ? ', non-retryable' : ''}): ${errorMessage}`,
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

  // --- Sync methods (ELD creates fleet, TMS enriches with business data) ---

  private async syncDrivers(tenantId: number, integrationId: number): Promise<SyncResult> {
    const log = new SyncActionLog();
    const driversBefore = await this.prisma.driver.count({
      where: { tenantId },
    });

    // ELD sync first (creates drivers from ELD data)
    const eldIntegrations = await this.prisma.integrationConfig.findMany({
      where: {
        tenantId,
        integrationType: 'ELD',
        isEnabled: true,
        status: { in: ['ACTIVE', 'CONFIGURED'] },
      },
      select: { id: true },
    });

    log.add('eld_sync_start', `Found ${eldIntegrations.length} active ELD integration(s)`);

    for (const eld of eldIntegrations) {
      try {
        const eldResult = await this.eldSyncService.syncDrivers(eld.id);
        log.merge(eldResult.actions);
      } catch (err) {
        this.logger.warn(`ELD driver sync failed for integration ${eld.id}: ${(err as Error).message}`);
        log.add('eld_sync_failed', `ELD sync failed for integration ${eld.id}: ${(err as Error).message}`, {
          integrationId: eld.id,
        });
      }
    }

    // TMS enrichment (enriches existing drivers with business data)
    const tmsResult = await this.tmsSyncService.syncDrivers(integrationId);
    log.merge(tmsResult.actions);

    const driversAfter = await this.prisma.driver.count({
      where: { tenantId },
    });
    const created = Math.max(0, driversAfter - driversBefore);

    return {
      recordsProcessed: driversAfter,
      recordsCreated: created,
      recordsExisting: Math.min(driversAfter, driversBefore),
      details: { actions: log.toArray() },
    };
  }

  private async syncVehicles(tenantId: number, integrationId: number): Promise<SyncResult> {
    const log = new SyncActionLog();
    const vehiclesBefore = await this.prisma.vehicle.count({
      where: { tenantId },
    });

    const eldIntegrations = await this.prisma.integrationConfig.findMany({
      where: {
        tenantId,
        integrationType: 'ELD',
        isEnabled: true,
        status: { in: ['ACTIVE', 'CONFIGURED'] },
      },
      select: { id: true },
    });

    log.add('eld_sync_start', `Found ${eldIntegrations.length} active ELD integration(s)`);

    for (const eld of eldIntegrations) {
      try {
        const eldResult = await this.eldSyncService.syncVehicles(eld.id);
        log.merge(eldResult.actions);
      } catch (err) {
        this.logger.warn(`ELD vehicle sync failed for integration ${eld.id}: ${(err as Error).message}`);
        log.add('eld_sync_failed', `ELD sync failed for integration ${eld.id}: ${(err as Error).message}`, {
          integrationId: eld.id,
        });
      }
    }

    const tmsResult = await this.tmsSyncService.syncVehicles(integrationId);
    log.merge(tmsResult.actions);

    const vehiclesAfter = await this.prisma.vehicle.count({
      where: { tenantId },
    });
    const created = Math.max(0, vehiclesAfter - vehiclesBefore);

    return {
      recordsProcessed: vehiclesAfter,
      recordsCreated: created,
      recordsExisting: Math.min(vehiclesAfter, vehiclesBefore),
      details: { actions: log.toArray() },
    };
  }

  private async syncLoads(integrationId: number): Promise<SyncResult> {
    const integration = await this.prisma.integrationConfig.findUnique({
      where: { id: integrationId },
      select: { tenantId: true },
    });

    if (!integration) {
      throw new NotFoundException(`Integration not found: ${integrationId}`);
    }

    const loadsBefore = await this.prisma.load.count({
      where: { tenantId: integration.tenantId },
    });

    const tmsResult = await this.tmsSyncService.syncLoads(integrationId);

    const loadsAfter = await this.prisma.load.count({
      where: { tenantId: integration.tenantId },
    });
    const created = Math.max(0, loadsAfter - loadsBefore);

    return {
      recordsProcessed: loadsAfter,
      recordsCreated: created,
      recordsExisting: Math.min(loadsAfter, loadsBefore),
      details: { actions: tmsResult.actions },
    };
  }
}
