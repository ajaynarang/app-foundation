import { Injectable, Logger } from '@nestjs/common';
import { AlertScope } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { AlertGenerationService } from './alert-generation.service';
import { ALERT_TYPES } from '../alert-types';

@Injectable()
export class AlertTriggersService {
  private readonly logger = new Logger(AlertTriggersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly alertGen: AlertGenerationService,
  ) {}

  async trigger(alertType: string, tenantId: number, driverId: string, params: Record<string, any> = {}) {
    const definition = ALERT_TYPES[alertType];
    if (!definition) {
      this.logger.warn(`Unknown alert type: ${alertType}`);
      return null;
    }

    // Check tenant alert configuration — skip if alert type is disabled
    const tenantConfig = await this.prisma.alertConfiguration.findUnique({
      where: { tenantId },
      select: { alertTypes: true },
    });
    if (tenantConfig?.alertTypes) {
      const alertTypes = tenantConfig.alertTypes as Record<string, { enabled: boolean }>;
      if (alertTypes[alertType] && alertTypes[alertType].enabled === false) {
        this.logger.debug(`Alert type ${alertType} is disabled for tenant ${tenantId} — skipping`);
        return null;
      }
    }

    // Auto-link loadId from driver's active load if not provided
    let loadId = params.loadId as string | undefined;
    if (!loadId && driverId) {
      loadId = await this.findDriverActiveLoadId(tenantId, driverId);
    }

    // Determine scope based on loadId presence
    const scope: AlertScope = loadId ? AlertScope.LOAD : AlertScope.FLEET;

    // Enrich metadata with tripId if load belongs to a trip
    const metadata = { ...params };
    if (loadId && !metadata.tripId) {
      const loadWithTrip = await this.prisma.load.findFirst({
        where: { loadNumber: loadId, tenantId },
        select: { trip: { select: { tripId: true } } },
      });
      if (loadWithTrip?.trip) {
        metadata.tripId = loadWithTrip.trip.tripId;
      }
    }

    return this.alertGen.generateAlert({
      tenantId,
      driverId,
      loadId,
      routePlanId: params.routePlanId,
      vehicleId: params.vehicleId,
      alertType: definition.type,
      category: definition.category,
      priority: params.priority || definition.defaultPriority,
      title: definition.title(params),
      message: definition.message(params),
      recommendedAction: definition.recommendedAction(params),
      metadata,
      scope,
    });
  }

  private async findDriverActiveLoadId(tenantId: number, driverId: string): Promise<string | undefined> {
    const load = await this.prisma.load.findFirst({
      where: {
        tenantId,
        driver: { driverId },
        status: { in: ['ASSIGNED', 'IN_TRANSIT'] },
      },
      select: { loadNumber: true },
      orderBy: { updatedAt: 'desc' },
    });
    return load?.loadNumber ?? undefined;
  }
}
