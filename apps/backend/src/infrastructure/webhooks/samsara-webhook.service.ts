import { Injectable, Logger } from '@nestjs/common';
import { AlertPriority } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AlertGenerationService } from '../../domains/operations/alerts/services/alert-generation.service';
import { SamsaraWebhookPayload } from './webhook.types';

@Injectable()
export class SamsaraWebhookService {
  private readonly logger = new Logger(SamsaraWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly alertGeneration: AlertGenerationService,
  ) {}

  async handleEvent(payload: SamsaraWebhookPayload): Promise<void> {
    const { eventType, data, eventId } = payload;

    // Resolve tenant from Samsara vehicle/driver ID
    const resolved = await this.resolveTenant(data);
    if (!resolved) {
      this.logger.warn(
        `Could not resolve tenant for webhook ${eventId} (vehicle: ${data.vehicle?.id}, driver: ${data.driver?.id})`,
      );
      return;
    }

    const { tenantId, driverId } = resolved;

    switch (eventType) {
      case 'HosViolation':
        await this.handleHosViolation(tenantId, driverId, data);
        break;
      case 'GeofenceEntry':
        await this.handleGeofenceEntry(tenantId, driverId, data);
        break;
      case 'GeofenceExit':
        await this.handleGeofenceExit(tenantId, driverId, data);
        break;
      case 'EngineFaultOn':
        await this.handleEngineFault(tenantId, driverId, data);
        break;
      default:
        this.logger.warn(`Unhandled webhook event type: ${String(eventType)}`);
    }
  }

  private async resolveTenant(
    data: SamsaraWebhookPayload['data'],
  ): Promise<{ tenantId: number; driverId: string } | null> {
    // Try vehicle match first
    if (data.vehicle?.id) {
      const vehicle = await this.prisma.vehicle.findFirst({
        where: {
          eldTelematicsMetadata: { path: ['eldId'], equals: data.vehicle.id },
        },
        select: { tenantId: true, vehicleId: true },
      });

      if (vehicle) {
        let driverId = 'unknown';
        if (data.driver?.id) {
          const driver = await this.prisma.driver.findFirst({
            where: {
              tenantId: vehicle.tenantId,
              eldMetadata: { path: ['eldId'], equals: data.driver.id },
            },
            select: { driverId: true },
          });
          if (driver) driverId = driver.driverId;
        }
        return { tenantId: vehicle.tenantId, driverId };
      }
    }

    // Try driver match
    if (data.driver?.id) {
      const driver = await this.prisma.driver.findFirst({
        where: {
          eldMetadata: { path: ['eldId'], equals: data.driver.id },
        },
        select: { tenantId: true, driverId: true },
      });
      if (driver) {
        return { tenantId: driver.tenantId, driverId: driver.driverId };
      }
    }

    return null;
  }

  private async handleHosViolation(tenantId: number, driverId: string, data: SamsaraWebhookPayload['data']) {
    await this.alertGeneration.generateAlert({
      tenantId,
      driverId,
      alertType: 'HOS_VIOLATION',
      category: 'hos',
      priority: AlertPriority.CRITICAL,
      title: `HOS Violation: ${data.violation?.type ?? 'Unknown'}`,
      message: data.violation?.description ?? 'HOS violation detected via Samsara webhook',
      metadata: { source: 'webhook', samsaraDriverId: data.driver?.id },
    });
  }

  private async handleGeofenceEntry(tenantId: number, driverId: string, data: SamsaraWebhookPayload['data']) {
    await this.alertGeneration.generateAlert({
      tenantId,
      driverId,
      alertType: 'GEOFENCE_ARRIVAL',
      category: 'route',
      priority: AlertPriority.LOW,
      title: `Arrived at ${data.geofence?.name ?? 'geofence'}`,
      message: `Vehicle entered geofence: ${data.geofence?.name ?? 'Unknown'}`,
      metadata: { source: 'webhook', geofenceId: data.geofence?.id },
    });
  }

  private async handleGeofenceExit(tenantId: number, driverId: string, data: SamsaraWebhookPayload['data']) {
    await this.alertGeneration.generateAlert({
      tenantId,
      driverId,
      alertType: 'GEOFENCE_DEPARTURE',
      category: 'route',
      priority: AlertPriority.LOW,
      title: `Departed from ${data.geofence?.name ?? 'geofence'}`,
      message: `Vehicle exited geofence: ${data.geofence?.name ?? 'Unknown'}`,
      metadata: { source: 'webhook', geofenceId: data.geofence?.id },
    });
  }

  private async handleEngineFault(tenantId: number, driverId: string, data: SamsaraWebhookPayload['data']) {
    await this.alertGeneration.generateAlert({
      tenantId,
      driverId,
      alertType: 'ENGINE_FAULT',
      category: 'vehicle',
      priority: AlertPriority.HIGH,
      title: `Engine Fault: ${data.fault?.code ?? 'Unknown'}`,
      message: data.fault?.description ?? 'Engine fault detected via Samsara webhook',
      metadata: { source: 'webhook', faultCode: data.fault?.code },
    });
  }
}
