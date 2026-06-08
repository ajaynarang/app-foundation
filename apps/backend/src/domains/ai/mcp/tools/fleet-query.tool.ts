import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { LoadStatus } from '@prisma/client';
import { AlertStatusSchema, formatLoadLabel } from '@sally/shared-types';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { RequiresScope } from '../../agent-contract/requires-scope.decorator';

const ALERT_STATUS = AlertStatusSchema.enum;

/**
 * Fleet Query MCP Tools — read-only tools for dispatcher fleet data access.
 *
 * All queries are tenant-scoped via `_tenantId`, which is injected by
 * McpToolService from the authenticated session — NEVER from AI input.
 * The AI cannot see or override the _tenantId parameter.
 */
@Injectable()
export class FleetQueryTool {
  constructor(private readonly prisma: PrismaService) {}

  @RequiresScope('fleet:read')
  @Tool({
    name: 'query-loads',
    description:
      "Query loads for the current tenant. Filter by status, driver name, customer name, or date range. Returns up to 20 loads with stops, driver, vehicle assignments, rate (rateDollars), referenceNumber (PO/Ref #), and a pre-formatted `loadLabel` that combines load number and PO (e.g. `#LD-001 · PO-12345`). ALWAYS use `loadLabel` when referring to a load in your response so dispatchers see the PO/Ref. Do NOT use for a single load's full details — use get-load-detail instead.",
    parameters: z.object({
      // z.nativeEnum binds the Zod schema to Prisma's LoadStatus directly,
      // so any drift in the schema is caught at compile time and the LLM
      // must pass an exact enum value (TENDER / DRAFT / PENDING / ASSIGNED
      // / IN_TRANSIT / ON_HOLD / DELIVERED / CANCELLED / TONU). A bad value
      // produces Zod's readable error at the tool boundary, not Prisma's
      // inscrutable "Invalid value for argument status" deep in the stack.
      status: z
        .nativeEnum(LoadStatus)
        .optional()
        .describe(`Filter by load status. Valid values (uppercase, exact): ${Object.values(LoadStatus).join(', ')}.`),
      driverName: z.string().optional().describe('Filter by driver name (partial match)'),
      customerName: z.string().optional().describe('Filter by customer name (partial match)'),
      referenceNumber: z.string().optional().describe('Filter by PO/reference number (partial match)'),
      limit: z.number().min(1).max(50).default(20).describe('Max results to return'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
    }),
  })
  async queryLoads({
    status,
    driverName,
    customerName,
    referenceNumber,
    limit,
    _tenantId,
  }: {
    status?: LoadStatus;
    driverName?: string;
    customerName?: string;
    referenceNumber?: string;
    limit: number;
    _tenantId?: number;
  }) {
    const loads = await this.prisma.load.findMany({
      where: {
        ...(_tenantId && { tenantId: _tenantId }),
        ...(status && { status }),
        ...(driverName && {
          driver: {
            name: { contains: driverName, mode: 'insensitive' as const },
          },
        }),
        ...(customerName && {
          customerName: {
            contains: customerName,
            mode: 'insensitive' as const,
          },
        }),
        ...(referenceNumber && {
          referenceNumber: {
            contains: referenceNumber,
            mode: 'insensitive' as const,
          },
        }),
      },
      include: {
        stops: {
          orderBy: { sequenceOrder: 'asc' },
          include: {
            stop: {
              select: {
                name: true,
                city: true,
                state: true,
              },
            },
          },
        },
        driver: { select: { name: true, driverId: true } },
        vehicle: { select: { unitNumber: true, vehicleId: true } },
        trip: { select: { tripId: true, loadCount: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            count: loads.length,
            loads: loads.map((l) => ({
              loadNumber: l.loadNumber,
              // Pre-formatted display label ("#LD-001 · PO-12345"). Use this
              // in LLM-generated responses so dispatchers always see the PO/
              // Ref #. Falls back to "#LD-001" when no referenceNumber.
              loadLabel: formatLoadLabel(l.loadNumber, l.referenceNumber),
              status: l.status,
              customer: l.customerName,
              driver: l.driver?.name ?? 'Unassigned',
              vehicle: l.vehicle?.unitNumber ?? 'Unassigned',
              weightLbs: l.weightLbs,
              commodityType: l.commodityType,
              referenceNumber: l.referenceNumber,
              isRelay: l.isRelay || false,
              tripId: (l as any).trip?.tripId ?? null,
              rateDollars: l.rateCents != null ? (l.rateCents / 100).toFixed(2) : null,
              stops: l.stops.map((ls) => ({
                type: ls.actionType,
                facility: ls.stop.name,
                location: `${ls.stop.city}, ${ls.stop.state}`,
                sequence: ls.sequenceOrder,
              })),
            })),
          }),
        },
      ],
    };
  }

  @RequiresScope('fleet:read')
  @Tool({
    name: 'get-driver-hos',
    description:
      'Get the current Hours of Service status for a driver. Returns driving hours remaining, duty time, cycle time, and break requirements. Do NOT use for driver contact info or CDL — use get-driver-detail. Do NOT use for pay — use get-driver-pay-structure.',
    parameters: z.object({
      driverName: z.string().describe('Driver name to look up (partial match supported)'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
    }),
  })
  async getDriverHOS({ driverName, _tenantId }: { driverName: string; _tenantId?: number }) {
    const driver = await this.prisma.driver.findFirst({
      where: {
        ...(_tenantId && { tenantId: _tenantId }),
        name: { contains: driverName, mode: 'insensitive' as const },
        status: 'ACTIVE',
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

    if (!driver) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: `No active driver found matching "${driverName}"`,
            }),
          },
        ],
      };
    }

    // HOS limits (standard FMCSA 70-hour/8-day)
    const MAX_DRIVE = 11;
    const MAX_DUTY = 14;
    const MAX_CYCLE = 70;
    const BREAK_REQUIRED_AFTER = 8;

    const hoursDriven = driver.currentHoursDriven ?? 0;
    const onDutyTime = driver.currentOnDutyTime ?? 0;
    const hoursSinceBreak = driver.currentHoursSinceBreak ?? 0;
    const cycleHoursUsed = driver.cycleHoursUsed ?? 0;

    const hosData = {
      driverId: driver.driverId,
      name: driver.name,
      hos: {
        driveTimeRemaining: Math.max(0, MAX_DRIVE - hoursDriven),
        dutyTimeRemaining: Math.max(0, MAX_DUTY - onDutyTime),
        cycleTimeRemaining: Math.max(0, MAX_CYCLE - cycleHoursUsed),
        hoursSinceLastBreak: hoursSinceBreak,
        breakRequired: hoursSinceBreak >= BREAK_REQUIRED_AFTER,
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
      _card: { type: 'hos' as const, data: hosData },
    };
  }

  @RequiresScope('fleet:read')
  @Tool({
    name: 'get-fleet-status',
    description:
      'Get a high-level overview of the fleet: active loads, drivers on duty, open alerts, available vehicles. No parameters required. Use for a quick overview. Do NOT use when dispatcher wants specific drivers or vehicles — use query-drivers or query-vehicles.',
    parameters: z.object({
      _tenantId: z.number().optional().describe('Internal: injected by system'),
    }),
  })
  async getFleetStatus({ _tenantId }: { _tenantId?: number }) {
    const tenantFilter = _tenantId ? { tenantId: _tenantId } : {};
    const [activeLoads, totalLoads, activeDrivers, totalDrivers, openAlerts, availableVehicles, totalVehicles] =
      await Promise.all([
        this.prisma.load.count({
          where: { ...tenantFilter, status: { in: ['ASSIGNED', 'IN_TRANSIT'] } },
        }),
        this.prisma.load.count({ where: tenantFilter }),
        this.prisma.driver.count({
          where: { ...tenantFilter, status: 'ACTIVE' },
        }),
        this.prisma.driver.count({ where: tenantFilter }),
        this.prisma.alert.count({ where: { ...tenantFilter, status: ALERT_STATUS.ACTIVE } }),
        this.prisma.vehicle.count({
          where: { ...tenantFilter, status: 'AVAILABLE' },
        }),
        this.prisma.vehicle.count({ where: tenantFilter }),
      ]);

    const fleetData = {
      loads: { active: activeLoads, total: totalLoads },
      drivers: { active: activeDrivers, total: totalDrivers },
      alerts: { open: openAlerts },
      vehicles: { available: availableVehicles, total: totalVehicles },
    };

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(fleetData),
        },
      ],
      _card: { type: 'fleet' as const, data: fleetData },
    };
  }
}
