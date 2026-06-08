import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { AlertPriority, RouteSegmentStatus } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { DriverToolUtils } from './driver-tool.utils';
import { RequiresScope } from '../../agent-contract/requires-scope.decorator';

/**
 * Driver Action MCP Tools — write tools for driver status reporting.
 *
 * All actions are scoped to the authenticated driver's current route.
 * Identity is resolved from `_userId` (JWT) → `User.driverId`.
 *
 * IMPORTANT: All write tools require HITL confirmation (confirm-action)
 * before execution. The tool descriptions instruct the AI accordingly.
 */
@Injectable()
export class DriverActionTool {
  private readonly utils: DriverToolUtils;

  constructor(private readonly prisma: PrismaService) {
    this.utils = new DriverToolUtils(prisma);
  }

  private async getActiveRoute(driverId: number, tenantId?: number) {
    return this.prisma.routePlan.findFirst({
      where: {
        ...(tenantId && { tenantId }),
        driverId,
        isActive: true,
      },
      include: {
        segments: {
          orderBy: { sequenceOrder: 'asc' },
          select: {
            id: true,
            segmentId: true,
            sequenceOrder: true,
            segmentType: true,
            toLocation: true,
            status: true,
          },
        },
      },
    });
  }

  private async getDriverInfo(driverId: number, tenantId?: number) {
    return this.prisma.driver.findFirst({
      where: { id: driverId, ...(tenantId && { tenantId }) },
      select: { id: true, driverId: true, name: true },
    });
  }

  @RequiresScope('fleet:write')
  @Tool({
    name: 'report-delay',
    description:
      "Report a delay on your current route. IMPORTANT: Before calling this tool, use confirm-action to get the driver's confirmation. This creates a delay event and notifies the dispatcher.",
    parameters: z.object({
      reason: z.string().max(500).describe('Reason for the delay (e.g., "Traffic jam on I-65")'),
      estimatedDelayMinutes: z.number().min(1).describe('Estimated delay in minutes'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async reportDelay({
    reason,
    estimatedDelayMinutes,
    _tenantId,
    _userId,
  }: {
    reason: string;
    estimatedDelayMinutes: number;
    _tenantId?: number;
    _userId?: string;
  }) {
    if (!_userId) return DriverToolUtils.noSessionError();

    const driverId = await this.utils.resolveDriverId(_userId);
    if (!driverId) return DriverToolUtils.noDriverError();

    // Parallelize independent queries
    const [route, driver] = await Promise.all([
      this.getActiveRoute(driverId, _tenantId),
      this.getDriverInfo(driverId, _tenantId),
    ]);
    if (!route) return DriverToolUtils.noRouteError();

    const eventId = `evt_${randomUUID().slice(0, 12)}`;
    const alertId = `alt_${randomUUID().slice(0, 12)}`;

    // Transactional write: event + alert must both succeed or both fail
    await this.prisma.$transaction([
      this.prisma.routeEvent.create({
        data: {
          eventId,
          planId: route.id,
          eventType: 'driver_delay_report',
          source: 'driver',
          occurredAt: new Date(),
          eventData: {
            reason,
            estimatedDelayMinutes,
            driverName: driver?.name,
          },
        },
      }),
      this.prisma.alert.create({
        data: {
          alertId,
          tenantId: _tenantId ?? route.tenantId,
          // Int FK to drivers.id (Phase 2 Task 10). Null when driver lookup
          // failed — the alert is still informative; ON DELETE SET NULL.
          driverId: driver?.id ?? null,
          // Int FK to route_plans.id; route.id is the resolved plan we just
          // fetched in getActiveRoute.
          routePlanId: route.id,
          alertType: 'driver_reported_delay',
          category: 'driver_report',
          priority: AlertPriority.MEDIUM,
          title: `Driver reported ${estimatedDelayMinutes}min delay`,
          message: `${driver?.name ?? 'Driver'} reported a delay: ${reason}. Estimated impact: ${estimatedDelayMinutes} minutes.`,
          recommendedAction: 'Review route and update ETA. Contact driver if delay exceeds 1 hour.',
        },
      }),
    ]);

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            eventId,
            alertId,
            message: `Delay reported: ${estimatedDelayMinutes} minutes. Your dispatcher has been notified.`,
          }),
        },
      ],
    };
  }

  @RequiresScope('fleet:write')
  @Tool({
    name: 'report-arrival',
    description:
      "Report arrival at a stop on your current route. IMPORTANT: Before calling this tool, use confirm-action to get the driver's confirmation. If no stop is specified, marks the next planned stop as arrived.",
    parameters: z.object({
      stopDescription: z
        .string()
        .max(200)
        .optional()
        .describe('Description of the stop you arrived at (partial match). If omitted, uses next planned stop.'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async reportArrival({
    stopDescription,
    _tenantId,
    _userId,
  }: {
    stopDescription?: string;
    _tenantId?: number;
    _userId?: string;
  }) {
    if (!_userId) return DriverToolUtils.noSessionError();

    const driverId = await this.utils.resolveDriverId(_userId);
    if (!driverId) return DriverToolUtils.noDriverError();

    // Parallelize independent queries
    const [route, driver] = await Promise.all([
      this.getActiveRoute(driverId, _tenantId),
      this.getDriverInfo(driverId, _tenantId),
    ]);
    if (!route) return DriverToolUtils.noRouteError();

    // Find the target segment.
    // Note: stopDescription uses case-insensitive substring matching against toLocation.
    // If multiple planned segments match, the earliest in sequence order is selected.
    let targetSegment;
    if (stopDescription) {
      targetSegment = route.segments.find(
        (s) =>
          s.status === RouteSegmentStatus.PLANNED &&
          s.toLocation?.toLowerCase().includes(stopDescription.toLowerCase()),
      );
    } else {
      targetSegment = route.segments.find((s) => s.status === RouteSegmentStatus.PLANNED);
    }

    if (!targetSegment) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: stopDescription
                ? `No matching planned stop found for "${stopDescription}"`
                : 'No matching planned stop found. All stops may be completed.',
            }),
          },
        ],
      };
    }

    const now = new Date();
    const eventId = `evt_${randomUUID().slice(0, 12)}`;
    const alertId = `alt_${randomUUID().slice(0, 12)}`;

    // Transactional write: segment update + event + alert must all succeed or all fail
    await this.prisma.$transaction([
      this.prisma.routeSegment.update({
        where: { id: targetSegment.id },
        data: { actualArrival: now, status: RouteSegmentStatus.COMPLETED },
      }),
      this.prisma.routeEvent.create({
        data: {
          eventId,
          planId: route.id,
          segmentId: targetSegment.segmentId,
          eventType: 'driver_arrival',
          source: 'driver',
          occurredAt: now,
          eventData: {
            segmentId: targetSegment.segmentId,
            destination: targetSegment.toLocation,
            driverName: driver?.name,
          },
        },
      }),
      this.prisma.alert.create({
        data: {
          alertId,
          tenantId: _tenantId ?? route.tenantId,
          // Int FK to drivers.id (Phase 2 Task 10). Null when driver lookup
          // failed — the alert is still informative; ON DELETE SET NULL.
          driverId: driver?.id ?? null,
          routePlanId: route.id,
          alertType: 'driver_arrival',
          category: 'driver_report',
          priority: AlertPriority.LOW,
          title: `Driver arrived at ${targetSegment.toLocation}`,
          message: `${driver?.name ?? 'Driver'} reported arrival at ${targetSegment.toLocation}.`,
        },
      }),
    ]);

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            segmentId: targetSegment.segmentId,
            destination: targetSegment.toLocation,
            arrivalTime: now.toISOString(),
            message: `Arrival at ${targetSegment.toLocation} recorded.`,
          }),
        },
      ],
    };
  }

  @RequiresScope('fleet:write')
  @Tool({
    name: 'report-fuel-stop',
    description:
      "Log a fuel stop on your current route. IMPORTANT: Before calling this tool, use confirm-action to get the driver's confirmation.",
    parameters: z.object({
      fuelStation: z.string().max(200).describe('Name of the fuel station'),
      gallons: z.number().min(0.1).describe('Gallons fueled'),
      costDollars: z.number().optional().describe('Total cost in dollars (optional)'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async reportFuelStop({
    fuelStation,
    gallons,
    costDollars,
    _tenantId,
    _userId,
  }: {
    fuelStation: string;
    gallons: number;
    costDollars?: number;
    _tenantId?: number;
    _userId?: string;
  }) {
    if (!_userId) return DriverToolUtils.noSessionError();

    const driverId = await this.utils.resolveDriverId(_userId);
    if (!driverId) return DriverToolUtils.noDriverError();

    // Parallelize independent queries
    const [route, driver] = await Promise.all([
      this.getActiveRoute(driverId, _tenantId),
      this.getDriverInfo(driverId, _tenantId),
    ]);
    if (!route) return DriverToolUtils.noRouteError();

    const eventId = `evt_${randomUUID().slice(0, 12)}`;

    await this.prisma.routeEvent.create({
      data: {
        eventId,
        planId: route.id,
        eventType: 'driver_fuel_report',
        source: 'driver',
        occurredAt: new Date(),
        eventData: {
          fuelStation,
          gallons,
          ...(costDollars !== undefined && { costDollars }),
          driverName: driver?.name,
        },
      },
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            eventId,
            message: `Fuel stop logged: ${gallons} gallons at ${fuelStation}.`,
          }),
        },
      ],
    };
  }
}
