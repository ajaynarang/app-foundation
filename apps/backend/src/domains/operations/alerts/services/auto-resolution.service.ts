import { Injectable, Logger } from '@nestjs/common';
import { AlertStatusSchema } from '@sally/shared-types';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';

const ALERT_STATUS = AlertStatusSchema.enum;

@Injectable()
export class AutoResolutionService {
  private readonly logger = new Logger(AutoResolutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventService,
  ) {}

  async autoResolve(alertId: string, tenantId: number, reason: string) {
    const updated = await this.prisma.alert.update({
      where: { alertId },
      data: {
        status: ALERT_STATUS.AUTO_RESOLVED,
        autoResolved: true,
        autoResolveReason: reason,
        resolvedAt: new Date(),
      },
    });

    await this.events.emit(SALLY_EVENTS.ALERT_RESOLVED, tenantId, {
      entityId: updated.alertId,
      entityType: 'alert',
      alertId: updated.alertId,
      status: ALERT_STATUS.AUTO_RESOLVED,
      reason,
    });

    this.logger.log(`Auto-resolved alert ${alertId}: ${reason}`);
    return updated;
  }

  async unsnoozeExpired() {
    try {
      const now = new Date();

      const expiredSnoozes = await this.prisma.alert.findMany({
        where: {
          status: ALERT_STATUS.SNOOZED,
          snoozedUntil: { lte: now },
        },
      });

      for (const alert of expiredSnoozes) {
        await this.prisma.alert.update({
          where: { alertId: alert.alertId },
          data: {
            status: ALERT_STATUS.ACTIVE,
            snoozedUntil: null,
          },
        });

        await this.events.emit(SALLY_EVENTS.ALERT_UNSNOOZED, alert.tenantId, {
          entityId: alert.alertId,
          entityType: 'alert',
          alertId: alert.alertId,
          status: ALERT_STATUS.ACTIVE,
        });

        this.logger.log(`Unsnoozed alert ${alert.alertId} — snooze period expired`);
      }

      if (expiredSnoozes.length > 0) {
        this.logger.log(`Unsnoozed ${expiredSnoozes.length} expired alerts`);
      }
    } catch (error) {
      this.logger.error('Snooze expiry check failed', error.stack);
    }
  }

  /**
   * Phase 2 Task 10 — driverDbId is the Int FK on alerts.driver_id, not the
   * public slug.
   */
  async autoResolveByCondition(tenantId: number, driverDbId: number, alertType: string, reason: string) {
    const activeAlerts = await this.prisma.alert.findMany({
      where: {
        tenantId,
        driverId: driverDbId,
        alertType,
        status: { in: [ALERT_STATUS.ACTIVE, ALERT_STATUS.ACKNOWLEDGED, ALERT_STATUS.SNOOZED] },
      },
    });

    for (const alert of activeAlerts) {
      await this.autoResolve(alert.alertId, tenantId, reason);
    }

    return activeAlerts.length;
  }
}
