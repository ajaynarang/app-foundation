import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { RouteSegmentStatus } from '@prisma/client';
import { HOS_CONSTANTS } from '@app/shared-types';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { DriverToolUtils } from './driver-tool.utils';
import { RequiresScope } from '../../agent-contract/requires-scope.decorator';

/**
 * Driver Read MCP Tools — read-only tools for a driver's own route, HOS, and next stop.
 *
 * All queries are driver-scoped: identity is resolved from `_userId` (JWT) → `User.driverId`.
 * The AI never controls driver identity — it comes from the authenticated session.
 */
@Injectable()
export class DriverReadTool {
  private readonly utils: DriverToolUtils;

  constructor(private readonly prisma: PrismaService) {
    this.utils = new DriverToolUtils(prisma);
  }

  @RequiresScope('fleet:read')
  @Tool({
    name: 'get-my-route',
    description:
      'Get the authenticated driver\'s current active route: all stops, progress, ETA, and assigned vehicle. Use when the driver says "show me my route" or "what\'s my plan today?". Do NOT use to check another driver\'s route — use get-route-status (dispatcher only). Do NOT use just for the next stop — use get-my-next-stop. No input needed — uses your authenticated session.',
    parameters: z.object({
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async getMyRoute({ _tenantId, _userId }: { _tenantId?: number; _userId?: string }) {
    if (!_userId) return DriverToolUtils.noSessionError();

    const driverId = await this.utils.resolveDriverId(_userId);
    if (!driverId) return DriverToolUtils.noDriverError();

    const routePlan = await this.prisma.routePlan.findFirst({
      where: {
        ...(_tenantId && { tenantId: _tenantId }),
        driverId,
        isActive: true,
      },
      include: {
        driver: { select: { name: true, driverId: true } },
        vehicle: { select: { unitNumber: true, vehicleId: true } },
        segments: {
          orderBy: { sequenceOrder: 'asc' },
          select: {
            sequenceOrder: true,
            segmentType: true,
            fromLocation: true,
            toLocation: true,
            distanceMiles: true,
            driveTimeHours: true,
            estimatedDeparture: true,
            estimatedArrival: true,
            status: true,
          },
        },
        loads: {
          include: {
            load: {
              select: { loadNumber: true, status: true, customerName: true },
            },
          },
        },
      },
    });

    if (!routePlan) return DriverToolUtils.noRouteError();

    const routeData = {
      planId: routePlan.planId,
      status: routePlan.status,
      departure: routePlan.departureTime?.toISOString(),
      estimatedArrival: routePlan.estimatedArrival?.toISOString(),
      totalDistanceMiles: routePlan.totalDistanceMiles,
      totalDriveTimeHours: routePlan.totalDriveTimeHours,
      totalTripTimeHours: routePlan.totalTripTimeHours,
      vehicle: routePlan.vehicle?.unitNumber ?? 'Unknown',
      loads: routePlan.loads.map((rl) => ({
        loadNumber: rl.load.loadNumber,
        status: rl.load.status,
        customer: rl.load.customerName,
      })),
      segments: routePlan.segments.map((s) => ({
        sequence: s.sequenceOrder,
        type: s.segmentType,
        from: s.fromLocation,
        to: s.toLocation,
        distanceMiles: s.distanceMiles,
        durationHours: s.driveTimeHours,
        departure: s.estimatedDeparture?.toISOString(),
        arrival: s.estimatedArrival?.toISOString(),
        status: s.status,
      })),
    };

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(routeData),
        },
      ],
      _card: { type: 'route', data: routeData },
    };
  }

  @RequiresScope('fleet:read')
  @Tool({
    name: 'get-my-hos',
    description:
      'Get the authenticated driver\'s own Hours of Service status: drive time remaining, duty time, cycle time, and whether a break is required. Use when the driver says "how many hours do I have left?" or "do I need a break soon?". Do NOT use to check another driver\'s HOS — use get-driver-active-context (dispatcher only). No input needed — uses your authenticated session.',
    parameters: z.object({
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async getMyHOS({ _tenantId, _userId }: { _tenantId?: number; _userId?: string }) {
    if (!_userId) return DriverToolUtils.noSessionError();

    const driverId = await this.utils.resolveDriverId(_userId);
    if (!driverId) return DriverToolUtils.noDriverError();

    const driver = await this.prisma.driver.findFirst({
      where: {
        id: driverId,
        ...(_tenantId && { tenantId: _tenantId }),
      },
      select: {
        driverId: true,
        name: true,
        currentHoursDriven: true,
        currentOnDutyTime: true,
        currentHoursSinceBreak: true,
        cycleHoursUsed: true,
        hosDataSyncedAt: true,
      },
    });

    if (!driver) return DriverToolUtils.noDriverError();

    const hoursDriven = driver.currentHoursDriven ?? 0;
    const onDutyTime = driver.currentOnDutyTime ?? 0;
    const hoursSinceBreak = driver.currentHoursSinceBreak ?? 0;
    const cycleHoursUsed = driver.cycleHoursUsed ?? 0;

    const hosData = {
      driverId: driver.driverId,
      name: driver.name,
      hos: {
        driveTimeRemaining: Math.max(0, HOS_CONSTANTS.MAX_DRIVE_HOURS - hoursDriven),
        dutyTimeRemaining: Math.max(0, HOS_CONSTANTS.MAX_DUTY_HOURS - onDutyTime),
        cycleTimeRemaining: Math.max(0, HOS_CONSTANTS.MAX_CYCLE_HOURS - cycleHoursUsed),
        hoursSinceLastBreak: hoursSinceBreak,
        breakRequired: hoursSinceBreak >= HOS_CONSTANTS.BREAK_TRIGGER_HOURS,
        hoursDriven,
        onDutyTime,
        cycleHoursUsed,
      },
      lastSynced: driver.hosDataSyncedAt?.toISOString() ?? 'Never',
    };

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(hosData),
        },
      ],
      _card: { type: 'hos', data: hosData },
    };
  }

  @RequiresScope('fleet:read')
  @Tool({
    name: 'get-my-next-stop',
    description:
      'Get the authenticated driver\'s next planned stop: destination, segment type (drive/dock/fuel/rest), ETA, and distance remaining. Use when the driver says "where am I headed next?" or "what\'s my next stop?". Do NOT use when the full route is needed — use get-my-route. No input needed — uses your authenticated session.',
    parameters: z.object({
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async getMyNextStop({ _tenantId, _userId }: { _tenantId?: number; _userId?: string }) {
    if (!_userId) return DriverToolUtils.noSessionError();

    const driverId = await this.utils.resolveDriverId(_userId);
    if (!driverId) return DriverToolUtils.noDriverError();

    const routePlan = await this.prisma.routePlan.findFirst({
      where: {
        ...(_tenantId && { tenantId: _tenantId }),
        driverId,
        isActive: true,
      },
      include: {
        segments: {
          orderBy: { sequenceOrder: 'asc' },
          select: {
            sequenceOrder: true,
            segmentType: true,
            fromLocation: true,
            toLocation: true,
            distanceMiles: true,
            driveTimeHours: true,
            estimatedDeparture: true,
            estimatedArrival: true,
            status: true,
          },
        },
      },
    });

    if (!routePlan) return DriverToolUtils.noRouteError();

    const nextSegment = routePlan.segments.find((s) => s.status === RouteSegmentStatus.PLANNED);

    if (!nextSegment) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              message: 'All stops completed on your current route.',
              planId: routePlan.planId,
            }),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            segmentType: nextSegment.segmentType,
            destination: nextSegment.toLocation,
            from: nextSegment.fromLocation,
            distanceMiles: nextSegment.distanceMiles,
            durationHours: nextSegment.driveTimeHours,
            departure: nextSegment.estimatedDeparture?.toISOString(),
            arrival: nextSegment.estimatedArrival?.toISOString(),
            planId: routePlan.planId,
          }),
        },
      ],
    };
  }
}
