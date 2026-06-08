import { Injectable, Logger } from '@nestjs/common';
import { AlertPriority } from '@prisma/client';
import { AlertStatusSchema } from '@sally/shared-types';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';

const ALERT_STATUS = AlertStatusSchema.enum;

interface EscalationPolicy {
  acknowledgeSlaMinutes: number;
  escalateTo: string;
  channels: string[];
}

@Injectable()
export class EscalationService {
  private readonly logger = new Logger(EscalationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventService,
  ) {}

  async checkEscalations() {
    try {
      this.logger.debug('Checking for alerts requiring escalation...');

      const configs = await this.prisma.alertConfiguration.findMany();

      for (const config of configs) {
        const policy = config.escalationPolicy as unknown as Record<string, EscalationPolicy>;
        if (!policy) continue;

        for (const [priority, rules] of Object.entries(policy)) {
          if (!rules || typeof rules.acknowledgeSlaMinutes !== 'number' || !isFinite(rules.acknowledgeSlaMinutes)) {
            continue;
          }

          const slaMs = rules.acknowledgeSlaMinutes * 60000;
          const cutoff = new Date(Date.now() - slaMs);

          // policy is JSON-keyed by priority; assume it matches the AlertPriority enum.
          // Skip non-matching keys defensively.
          const priorityEnum = priority.toUpperCase() as AlertPriority;
          if (!Object.values(AlertPriority).includes(priorityEnum)) {
            this.logger.warn(`Unknown priority key in escalation policy: ${priority}`);
            continue;
          }
          const overdueAlerts = await this.prisma.alert.findMany({
            where: {
              tenantId: config.tenantId,
              priority: priorityEnum,
              status: ALERT_STATUS.ACTIVE,
              acknowledgedAt: null,
              createdAt: { lte: cutoff },
              escalationLevel: 0,
            },
          });

          for (const alert of overdueAlerts) {
            const updated = await this.prisma.alert.update({
              where: { alertId: alert.alertId },
              data: {
                escalationLevel: alert.escalationLevel + 1,
                escalatedAt: new Date(),
              },
            });

            this.logger.warn(
              `Escalated alert ${alert.alertId} (${priority}) to level ${updated.escalationLevel} — SLA of ${rules.acknowledgeSlaMinutes}min exceeded`,
            );

            await this.events.emit(SALLY_EVENTS.ALERT_ESCALATED, config.tenantId, {
              entityId: alert.alertId,
              entityType: 'alert',
              alertId: alert.alertId,
              priority: alert.priority,
              escalationLevel: updated.escalationLevel,
              escalateTo: rules.escalateTo,
            });
          }
        }
      }
    } catch (error) {
      this.logger.error('Alert escalation check failed', error.stack);
    }
  }
}
