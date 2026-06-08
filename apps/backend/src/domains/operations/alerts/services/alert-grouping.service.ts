import { Injectable, Logger } from '@nestjs/common';
import { AlertStatusSchema } from '@sally/shared-types';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const ALERT_STATUS = AlertStatusSchema.enum;

// Maps alert types to their potential parent (cascading) types
const CASCADE_MAP: Record<string, string[]> = {
  HOS_VIOLATION: ['HOS_APPROACHING_LIMIT'],
  BREAK_REQUIRED: ['HOS_APPROACHING_LIMIT'],
  MISSED_APPOINTMENT: ['APPOINTMENT_AT_RISK'],
  FUEL_EMPTY: ['FUEL_LOW'],
};

@Injectable()
export class AlertGroupingService {
  private readonly logger = new Logger(AlertGroupingService.name);

  constructor(private readonly prisma: PrismaService) {}

  generateDedupKey(tenantId: number, driverId: string, alertType: string, loadId?: string): string {
    const base = `${tenantId}:${driverId}:${alertType}`;
    return loadId ? `${base}:${loadId}` : base;
  }

  generateGroupKey(tenantId: number, driverId: string, category: string): string {
    return `${tenantId}:${driverId}:${category}`;
  }

  async findDuplicate(dedupKey: string, dedupWindowMinutes?: number) {
    // If a dedup window is configured, also suppress creation of alerts
    // that were recently resolved (within the window) to prevent noise
    if (dedupWindowMinutes && dedupWindowMinutes > 0) {
      const windowCutoff = new Date(Date.now() - dedupWindowMinutes * 60000);
      // Check for active/snoozed/acknowledged OR recently resolved within window
      return this.prisma.alert.findFirst({
        where: {
          dedupKey,
          OR: [
            { status: { in: [ALERT_STATUS.ACTIVE, ALERT_STATUS.ACKNOWLEDGED, ALERT_STATUS.SNOOZED] } },
            {
              status: ALERT_STATUS.RESOLVED,
              resolvedAt: { gte: windowCutoff },
            },
          ],
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    // No dedup window — only match active/acknowledged/snoozed alerts
    return this.prisma.alert.findFirst({
      where: {
        dedupKey,
        status: { in: [ALERT_STATUS.ACTIVE, ALERT_STATUS.ACKNOWLEDGED, ALERT_STATUS.SNOOZED] },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Find a recently auto-resolved alert that can be reactivated instead of
   * creating a new one. Prevents resolve→recreate flip-flop spam.
   */
  async findReactivatable(
    dedupKey: string,
    windowMinutes: number = 60,
  ): Promise<{
    alertId: string;
    occurrenceCount: number;
    priority: string;
  } | null> {
    return this.prisma.alert.findFirst({
      where: {
        dedupKey,
        autoResolved: true,
        resolvedAt: { gte: new Date(Date.now() - windowMinutes * 60000) },
      },
      select: { alertId: true, occurrenceCount: true, priority: true },
      orderBy: { resolvedAt: 'desc' },
    });
  }

  /**
   * Check if a manually resolved alert is still within its cooldown period.
   */
  async findCooldownActive(dedupKey: string): Promise<boolean> {
    const alert = await this.prisma.alert.findFirst({
      where: {
        dedupKey,
        status: ALERT_STATUS.RESOLVED,
        autoResolved: false,
        manualResolveCooldownUntil: { gt: new Date() },
      },
    });
    return alert !== null;
  }

  /**
   * Phase 2 Task 10 — driverDbId is the Int FK (alerts.driver_id), not the
   * public slug. Callers in AlertGenerationService resolve the slug to the
   * FK once and pass it through to both the create and the parent lookup.
   */
  async findParentAlert(tenantId: number, driverDbId: number, alertType: string) {
    const parentTypes = CASCADE_MAP[alertType];
    if (!parentTypes || parentTypes.length === 0) return null;

    return this.prisma.alert.findFirst({
      where: {
        tenantId,
        driverId: driverDbId,
        alertType: { in: parentTypes },
        status: { in: [ALERT_STATUS.ACTIVE, ALERT_STATUS.ACKNOWLEDGED] },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getGroupingConfig(tenantId: number) {
    const config = await this.prisma.alertConfiguration.findUnique({
      where: { tenantId },
    });

    return (
      (config?.groupingConfig as unknown as {
        dedupWindowMinutes: number;
        groupSameTypePerDriver: boolean;
        smartGroupAcrossDrivers: boolean;
        linkCascading: boolean;
      }) || {
        dedupWindowMinutes: 15,
        groupSameTypePerDriver: true,
        smartGroupAcrossDrivers: true,
        linkCascading: true,
      }
    );
  }

  /**
   * Link a child alert (looked up by its public alertId slug) to a parent alert.
   * `parentAlertId` is the parent's Int primary key — the FK was migrated from
   * the public slug to Alert.id in Phase 2 Task 2.
   */
  async linkToParent(alertId: string, parentAlertId: number) {
    return this.prisma.alert.update({
      where: { alertId },
      data: { parentAlertId },
    });
  }
}
