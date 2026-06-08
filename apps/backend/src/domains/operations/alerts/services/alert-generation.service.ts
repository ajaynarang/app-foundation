import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AlertPriority, AlertScope } from '@prisma/client';
import { AlertStatusSchema } from '@sally/shared-types';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { DomainEvent } from '../../../../infrastructure/events/domain-event';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';
import { AlertGroupingService } from './alert-grouping.service';
import { AlertCacheService } from './alert-cache.service';
import { randomUUID } from 'crypto';

const ALERT_STATUS = AlertStatusSchema.enum;

interface GenerateAlertParams {
  tenantId: number;
  driverId: string;
  loadId?: string;
  routePlanId?: string;
  vehicleId?: string;
  alertType: string;
  category: string;
  priority: AlertPriority;
  title: string;
  message: string;
  recommendedAction?: string;
  metadata?: Record<string, any>;
  scope?: AlertScope;
}

@Injectable()
export class AlertGenerationService {
  private readonly logger = new Logger(AlertGenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly groupingService: AlertGroupingService,
    private readonly alertCache: AlertCacheService,
  ) {}

  async generateAlert(params: GenerateAlertParams) {
    const config = await this.groupingService.getGroupingConfig(params.tenantId);

    // Step 1: Generate dedup key (now includes loadId for load-scoped alerts)
    const dedupKey = this.groupingService.generateDedupKey(
      params.tenantId,
      params.driverId,
      params.alertType,
      params.loadId,
    );

    if (config.groupSameTypePerDriver) {
      // Step 1a: Check for active/acknowledged/snoozed duplicate — update occurrence, skip creation
      const duplicate = await this.groupingService.findDuplicate(dedupKey, config.dedupWindowMinutes);

      if (duplicate) {
        await this.prisma.alert.update({
          where: { alertId: duplicate.alertId },
          data: {
            occurrenceCount: { increment: 1 },
            lastOccurredAt: new Date(),
            message: params.message,
            metadata: params.metadata,
          },
        });
        this.logger.debug(
          `Updated existing alert: ${params.alertType} for driver ${params.driverId} (existing: ${duplicate.alertId})`,
        );
        return null;
      }

      // Step 1b: Check for manual resolve cooldown — skip entirely
      const cooldownActive = await this.groupingService.findCooldownActive(dedupKey);
      if (cooldownActive) {
        this.logger.debug(
          `Skipping alert ${params.alertType} for driver ${params.driverId} — manual resolve cooldown active`,
        );
        return null;
      }

      // Step 1c: Check for recently auto-resolved alert — reactivate instead of creating new
      const reactivatable = await this.groupingService.findReactivatable(dedupKey);
      if (reactivatable) {
        const escalatedPriority = this.maybeEscalatePriority(params.priority, reactivatable.occurrenceCount);

        const reactivated = await this.prisma.alert.update({
          where: { alertId: reactivatable.alertId },
          data: {
            status: ALERT_STATUS.ACTIVE,
            priority: escalatedPriority,
            resolvedAt: null,
            resolvedBy: null,
            autoResolved: false,
            autoResolveReason: null,
            resolutionNotes: null,
            occurrenceCount: { increment: 1 },
            lastOccurredAt: new Date(),
            message: params.message,
            metadata: params.metadata,
            title: params.title,
            recommendedAction: params.recommendedAction,
          },
        });

        this.logger.log(
          `Reactivated alert ${reactivatable.alertId} (occurrence #${reactivated.occurrenceCount}, priority: ${escalatedPriority})`,
        );

        await this.alertCache.bustStatsCache(params.tenantId);
        return reactivated;
      }
    }

    // Step 2: Generate group key
    const groupKey = this.groupingService.generateGroupKey(params.tenantId, params.driverId, params.category);

    // Step 3: Resolve business-ID slugs to Int FKs (Phase 2 Task 10). The
    // public params API still accepts slugs because that's what every
    // caller has on hand (webhooks, monitoring triggers, AI tools); the
    // service does the lookup at the write boundary. Misses (slug doesn't
    // resolve to a row) become NULL — alerts for vanished or never-created
    // entities are still informative; ON DELETE SET NULL preserves the same
    // behavior going forward.
    const fkIds = await this.resolveContextFks(params);

    // Step 4: Create the alert
    const alertId = `ALT-${randomUUID().slice(0, 8).toUpperCase()}`;

    const alert = await this.prisma.alert.create({
      data: {
        alertId,
        tenantId: params.tenantId,
        driverId: fkIds.driverId,
        loadId: fkIds.loadId,
        routePlanId: fkIds.routePlanId,
        vehicleId: fkIds.vehicleId,
        alertType: params.alertType,
        category: params.category,
        priority: params.priority,
        title: params.title,
        message: params.message,
        recommendedAction: params.recommendedAction,
        metadata: params.metadata,
        scope: params.scope ?? AlertScope.LOAD,
        dedupKey,
        groupKey,
        lastOccurredAt: new Date(),
      },
    });

    // Step 4: Link to parent if cascading is enabled. fkIds.driverId is the
    // resolved Int FK (or null when the slug didn't match); skip linkage if
    // the driver couldn't be resolved because findParentAlert filters by FK.
    if (config.linkCascading && fkIds.driverId !== null) {
      const parent = await this.groupingService.findParentAlert(params.tenantId, fkIds.driverId, params.alertType);

      if (parent) {
        await this.groupingService.linkToParent(alert.alertId, parent.id);
        this.logger.log(`Linked alert ${alert.alertId} to parent ${parent.alertId}`);
      }
    }

    await this.alertCache.bustStatsCache(params.tenantId);

    // Step 5: Resolve recipients (dispatchers + affected driver) and emit
    // ALERT_FIRED. The bridge fans out SSE delivery via emitToUser per id.
    // The cache-invalidation subscriber also listens for ALERT_FIRED, so
    // stats / KPI / command-center / analytics caches now refresh on every
    // alert fire (in addition to the manual bustStatsCache above).
    try {
      const dispatchers = await this.prisma.user.findMany({
        where: {
          tenantId: params.tenantId,
          role: { in: ['OWNER', 'ADMIN', 'DISPATCHER'] },
          isActive: true,
          deletedAt: null,
        },
        select: { userId: true },
      });

      let driverUserId: string | null = null;
      if (params.driverId) {
        const driverRecord = await this.prisma.driver.findFirst({
          where: { driverId: params.driverId, tenantId: params.tenantId },
          select: { id: true },
        });
        if (driverRecord) {
          const driverUser = await this.prisma.user.findFirst({
            where: { driverId: driverRecord.id, isActive: true },
            select: { userId: true },
          });
          driverUserId = driverUser?.userId ?? null;
        }
      }

      const recipientUserIds = [...dispatchers.map((d) => d.userId), ...(driverUserId ? [driverUserId] : [])];

      if (recipientUserIds.length > 0) {
        this.eventEmitter.emit(
          SALLY_EVENTS.ALERT_FIRED,
          new DomainEvent(SALLY_EVENTS.ALERT_FIRED, String(params.tenantId), {
            alertId: alert.alertId,
            alertType: alert.alertType,
            category: alert.category,
            priority: alert.priority,
            title: alert.title,
            message: alert.message,
            // params.driverId / params.loadId are the public string slugs
            // (Driver.driverId / Load.loadNumber) — the SSE payload keeps the
            // public identifiers for UI consumers, not the internal Int FKs.
            // loadNumber lets the Tower live-wire item set relatedLoadId so
            // the "Open load" action works on live alerts, not just backfill.
            driverId: params.driverId,
            loadNumber: params.loadId,
            createdAt: alert.createdAt,
            playSound: true,
            flashTab: params.priority === AlertPriority.CRITICAL,
            showBrowserNotification: true,
            recipientUserIds,
          }),
        );
      }
    } catch (error: any) {
      this.logger.error(`ALERT_FIRED emission failed: ${error.message}`);
    }

    this.logger.log(
      `Generated alert ${alert.alertId}: ${alert.alertType} (${alert.priority}) for driver ${params.driverId}`,
    );

    return alert;
  }

  /**
   * Resolve the public business-ID slugs on GenerateAlertParams into the Int
   * FKs the `alerts` table now stores (Phase 2 Task 10). Slugs that don't
   * resolve to a row become NULL — alerts for vanished entities are still
   * informative and ON DELETE SET NULL keeps the historical record. All four
   * lookups run in parallel; vehicle / load resolution is tenant-scoped
   * because their natural-key uniqueness is `(slug, tenant_id)`.
   */
  private async resolveContextFks(params: GenerateAlertParams): Promise<{
    driverId: number | null;
    loadId: number | null;
    routePlanId: number | null;
    vehicleId: number | null;
  }> {
    const [driver, load, routePlan, vehicle] = await Promise.all([
      params.driverId
        ? this.prisma.driver.findUnique({ where: { driverId: params.driverId }, select: { id: true } })
        : Promise.resolve(null),
      params.loadId
        ? this.prisma.load.findUnique({
            where: { loadNumber_tenantId: { loadNumber: params.loadId, tenantId: params.tenantId } },
            select: { id: true },
          })
        : Promise.resolve(null),
      params.routePlanId
        ? this.prisma.routePlan.findUnique({ where: { planId: params.routePlanId }, select: { id: true } })
        : Promise.resolve(null),
      params.vehicleId
        ? this.prisma.vehicle.findUnique({
            where: { vehicleId_tenantId: { vehicleId: params.vehicleId, tenantId: params.tenantId } },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);
    return {
      driverId: driver?.id ?? null,
      loadId: load?.id ?? null,
      routePlanId: routePlan?.id ?? null,
      vehicleId: vehicle?.id ?? null,
    };
  }

  private static readonly PRIORITY_LADDER: AlertPriority[] = [
    AlertPriority.LOW,
    AlertPriority.MEDIUM,
    AlertPriority.HIGH,
    AlertPriority.CRITICAL,
  ];

  private maybeEscalatePriority(currentPriority: AlertPriority, occurrenceCount: number): AlertPriority {
    if (occurrenceCount >= 5) return AlertPriority.CRITICAL;
    if (occurrenceCount >= 3 && currentPriority !== AlertPriority.CRITICAL) {
      const idx = AlertGenerationService.PRIORITY_LADDER.indexOf(currentPriority);
      return idx >= 0 && idx < AlertGenerationService.PRIORITY_LADDER.length - 1
        ? AlertGenerationService.PRIORITY_LADDER[idx + 1]
        : currentPriority;
    }
    return currentPriority;
  }
}
