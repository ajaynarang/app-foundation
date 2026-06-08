import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { AlertTriggersService } from '../../alerts/services/alert-triggers.service';
import { DomainEvent } from '../../../../infrastructure/events/domain-event';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';
import { MonitoringTrigger } from '../monitoring.types';

@Injectable()
export class RouteEventService {
  private readonly logger = new Logger(RouteEventService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly alertTriggers: AlertTriggersService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Record a route event in the unified activity log.
   * Called by driver endpoints, GPS monitoring, and system auto-complete.
   * Emits SSE for live UI updates. Does NOT create alerts (use handleMonitoringTriggers for that).
   */
  async recordEvent(params: {
    planId: number;
    planStringId: string;
    tenantId: number;
    segmentId?: string;
    eventType: string;
    source: 'driver' | 'dispatcher' | 'monitoring' | 'system';
    eventData?: Record<string, any>;
    location?: { lat: number; lon: number };
    replanRecommended?: boolean;
    replanReason?: string;
    impactSummary?: Record<string, any>;
  }): Promise<{ eventId: string }> {
    const eventId = `EVT-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;

    await this.prisma.routeEvent.create({
      data: {
        eventId,
        planId: params.planId,
        segmentId: params.segmentId ?? null,
        eventType: params.eventType,
        source: params.source,
        occurredAt: new Date(),
        eventData: params.eventData ?? undefined,
        lat: params.location?.lat ?? null,
        lon: params.location?.lon ?? null,
        replanRecommended: params.replanRecommended ?? false,
        replanReason: params.replanReason ?? null,
        impactSummary: params.impactSummary ?? undefined,
      },
    });

    // Emit ROUTE_EVENT_RECORDED — bridge fans out tenant-scoped SSE delivery
    this.eventEmitter.emit(
      SALLY_EVENTS.ROUTE_EVENT_RECORDED,
      new DomainEvent(SALLY_EVENTS.ROUTE_EVENT_RECORDED, String(params.tenantId), {
        eventId,
        planId: params.planStringId,
        segmentId: params.segmentId,
        eventType: params.eventType,
        source: params.source,
        eventData: params.eventData,
        timestamp: new Date().toISOString(),
      }),
    );

    return { eventId };
  }

  /**
   * Handle monitoring triggers — creates alerts + route events.
   * Called by the monitoring cron when checks detect issues.
   * This is the existing pipeline: trigger → alert → SSE → route event.
   */
  async handleMonitoringTriggers(
    triggers: MonitoringTrigger[],
    plan: { planId: string; id: number; tenantId: number; planVersion: number },
    driverId: string,
  ): Promise<void> {
    if (triggers.length === 0) return;

    const needsReplan = triggers.some((t) => t.requiresReplan && t.etaImpactMinutes > 30);
    const maxEtaImpact = Math.max(...triggers.map((t) => t.etaImpactMinutes));

    for (const trigger of triggers) {
      // 1. Fire alert (dispatcher-actionable)
      await this.alertTriggers.trigger(trigger.type, plan.tenantId, driverId, {
        ...trigger.params,
        routePlanId: plan.planId,
        priority: trigger.severity,
      });

      // 2. Record route event (audit trail)
      await this.recordEvent({
        planId: plan.id,
        planStringId: plan.planId,
        tenantId: plan.tenantId,
        eventType: trigger.type,
        source: 'monitoring',
        eventData: trigger.params,
        replanRecommended: trigger.requiresReplan && trigger.etaImpactMinutes > 30,
        replanReason: trigger.requiresReplan ? `${trigger.type}: ETA impact ${trigger.etaImpactMinutes}min` : undefined,
        impactSummary: {
          etaChangeMinutes: trigger.etaImpactMinutes,
          alertsFired: 1,
          severity: trigger.severity,
        },
      });
    }

    // 3. Emit summary domain events — bridge fans out tenant-scoped SSE
    if (needsReplan) {
      this.logger.warn(`Route ${plan.planId} needs re-plan. ETA impact: ${maxEtaImpact}min`);
      this.eventEmitter.emit(
        SALLY_EVENTS.ROUTE_REPLAN_RECOMMENDED,
        new DomainEvent(SALLY_EVENTS.ROUTE_REPLAN_RECOMMENDED, String(plan.tenantId), {
          planId: plan.planId,
          reason: triggers
            .filter((t) => t.requiresReplan)
            .map((t) => t.type)
            .join(', '),
        }),
      );
    } else if (maxEtaImpact > 0) {
      this.eventEmitter.emit(
        SALLY_EVENTS.ROUTE_ETA_SHIFTED,
        new DomainEvent(SALLY_EVENTS.ROUTE_ETA_SHIFTED, String(plan.tenantId), {
          planId: plan.planId,
          etaShiftMinutes: maxEtaImpact,
        }),
      );
    }
  }
}
