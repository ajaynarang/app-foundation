import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { RequiresScope } from '../../agent-contract/requires-scope.decorator';
import {
  RoutePlanningEngineService,
  RoutePlanResult,
  RelayRoutePlanResult,
} from '../../../routing/route-planning/services/route-planning-engine.service';

/**
 * Route Planning MCP Tools — expose route planning capabilities to the dispatcher agent.
 *
 * plan-route: Runs the real planning engine and returns the generated DRAFT plan.
 *   The plan is persisted as `draft` (never auto-activated), so surfacing it to the
 *   dispatcher IS the human-in-the-loop step — activation is a separate confirmed action.
 * get-route-status: Read-only query of existing route plans.
 */
@Injectable()
export class RoutePlanningTool {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => RoutePlanningEngineService))
    private readonly routePlanningEngine: RoutePlanningEngineService,
  ) {}

  @RequiresScope('fleet:write')
  @Tool({
    name: 'plan-route',
    description:
      'Create a new route plan for a driver, vehicle, and load set. Use when the dispatcher says "plan a route for [driver] with loads [X, Y]" or "set up a trip for truck [unit]." Do NOT use to look up an existing route — use get-route-status. Requires user confirmation before executing.',
    parameters: z.object({
      driverName: z.string().describe('Driver name to assign the route to'),
      vehicleUnit: z.string().describe('Vehicle unit number'),
      loadIds: z.array(z.string()).min(1).describe('Load IDs to include in the route'),
      departureTime: z.string().optional().describe('ISO 8601 departure time. Defaults to now.'),
      optimizationPriority: z
        .enum(['minimize_time', 'minimize_cost', 'balance'])
        .default('balance')
        .describe('Route optimization priority'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
    }),
  })
  async planRoute({
    driverName,
    vehicleUnit,
    loadIds,
    departureTime,
    optimizationPriority,
    _tenantId,
  }: {
    driverName: string;
    vehicleUnit: string;
    loadIds: string[];
    departureTime?: string;
    optimizationPriority: string;
    _tenantId?: number;
  }) {
    // Tenant scope is mandatory — guard BEFORE any lookup so a missing tenant can
    // never run a cross-tenant query.
    if (!_tenantId) {
      return this.errorResult('Unable to plan a route without a tenant context');
    }

    // Resolve driver by name
    const driver = await this.prisma.driver.findFirst({
      where: {
        ...(_tenantId && { tenantId: _tenantId }),
        name: { contains: driverName, mode: 'insensitive' as const },
        status: 'ACTIVE',
      },
      select: { driverId: true, name: true },
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

    // Resolve vehicle by unit number
    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        ...(_tenantId && { tenantId: _tenantId }),
        unitNumber: { contains: vehicleUnit, mode: 'insensitive' as const },
      },
      select: { vehicleId: true, unitNumber: true },
    });

    if (!vehicle) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: `No vehicle found matching unit "${vehicleUnit}"`,
            }),
          },
        ],
      };
    }

    // Verify loads exist and belong to this tenant
    const loads = await this.prisma.load.findMany({
      where: {
        loadNumber: { in: loadIds },
        ...(_tenantId && { tenantId: _tenantId }),
      },
      select: { loadNumber: true, status: true },
    });

    const missingLoads = loadIds.filter((id) => !loads.some((l) => l.loadNumber === id));
    if (missingLoads.length > 0) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: `Loads not found: ${missingLoads.join(', ')}`,
            }),
          },
        ],
      };
    }

    // Run the REAL planning engine. The result is persisted as a DRAFT plan; the
    // dispatcher reviews and activates it separately (that's the HITL boundary).
    try {
      const plan = await this.routePlanningEngine.planRoute({
        driverId: driver.driverId,
        vehicleId: vehicle.vehicleId,
        loadIds,
        departureTime: departureTime ? new Date(departureTime) : new Date(),
        tenantId: _tenantId,
        optimizationPriority: optimizationPriority as 'minimize_time' | 'minimize_cost' | 'balance',
      });

      const summary = this.summarizePlan(plan, driver.name, vehicle.unitNumber);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(summary) }],
        _card: { type: 'route', data: summary },
      };
    } catch (error) {
      return this.errorResult(
        `Could not generate the route: ${error instanceof Error ? error.message : 'please try again'}`,
      );
    }
  }

  private summarizePlan(plan: RoutePlanResult | RelayRoutePlanResult, driverName: string, vehicleUnit: string) {
    if (this.isRelayResult(plan)) {
      return {
        status: 'draft_created',
        planType: 'relay',
        message: `Drafted a ${plan.totalLegs}-leg relay plan for load ${plan.loadNumber} (${Math.round(plan.totalDistanceMiles)} mi total). Review each leg, then assign to activate.`,
        loadNumber: plan.loadNumber,
        totalLegs: plan.totalLegs,
        totalDistanceMiles: Math.round(plan.totalDistanceMiles),
        totalDriveTimeHours: Math.round(plan.totalDriveTimeHours * 10) / 10,
      };
    }

    const feasibility = plan.isFeasible
      ? 'It is HOS-feasible.'
      : `⚠️ It has ${plan.feasibilityIssues.length} feasibility issue(s): ${plan.feasibilityIssues.join('; ')}`;
    return {
      status: 'draft_created',
      planType: 'single',
      planId: plan.planId,
      message:
        `Drafted route ${plan.planId} for ${driverName} on ${vehicleUnit}: ${Math.round(plan.totalDistanceMiles)} mi, ` +
        `${Math.round(plan.totalDriveTimeHours * 10) / 10}h driving over ${plan.totalDrivingDays} day(s). ${feasibility} ` +
        `Review and assign to activate.`,
      isFeasible: plan.isFeasible,
      feasibilityIssues: plan.feasibilityIssues,
      totalDistanceMiles: Math.round(plan.totalDistanceMiles),
      totalDriveTimeHours: Math.round(plan.totalDriveTimeHours * 10) / 10,
      totalDrivingDays: plan.totalDrivingDays,
      estimatedArrival: plan.estimatedArrival,
      hosSource: plan.hosSource,
    };
  }

  private isRelayResult(plan: RoutePlanResult | RelayRoutePlanResult): plan is RelayRoutePlanResult {
    return (plan as RelayRoutePlanResult).type === 'relay';
  }

  private errorResult(message: string) {
    return { content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }] };
  }

  @RequiresScope('fleet:read')
  @Tool({
    name: 'get-route-status',
    description:
      'Get the status of a dispatcher-managed route plan by plan ID or driver name. Use when the dispatcher asks "where is [driver] on their route?" or "what\'s the status of plan [ID]?" Returns route details, progress, segments, and ETA. Do NOT use for a driver checking their own route — use get-my-route.',
    parameters: z.object({
      planId: z.string().optional().describe('Route plan ID to look up'),
      driverName: z.string().optional().describe('Driver name to find active route for'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
    }),
  })
  async getRouteStatus({
    planId,
    driverName,
    _tenantId,
  }: {
    planId?: string;
    driverName?: string;
    _tenantId?: number;
  }) {
    if (!planId && !driverName) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: 'Provide either planId or driverName',
            }),
          },
        ],
      };
    }

    // If searching by driver name, resolve to driver integer ID
    let driverDbId: number | undefined;
    if (driverName && !planId) {
      const driver = await this.prisma.driver.findFirst({
        where: {
          ...(_tenantId && { tenantId: _tenantId }),
          name: { contains: driverName, mode: 'insensitive' as const },
        },
        select: { id: true },
      });
      if (!driver) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `No driver found matching "${driverName}"`,
              }),
            },
          ],
        };
      }
      driverDbId = driver.id;
    }

    const routePlan = await this.prisma.routePlan.findFirst({
      where: {
        ...(_tenantId && { tenantId: _tenantId }),
        ...(planId && { planId }),
        ...(driverDbId && { driverId: driverDbId }),
        ...(driverDbId && !planId && { isActive: true }),
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

    if (!routePlan) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: planId ? `Route plan ${planId} not found` : `No active route for "${driverName}"`,
            }),
          },
        ],
      };
    }

    const routeData = {
      planId: routePlan.planId,
      status: routePlan.status,
      isActive: routePlan.isActive,
      isFeasible: routePlan.isFeasible,
      driver: routePlan.driver?.name ?? 'Unknown',
      vehicle: routePlan.vehicle?.unitNumber ?? 'Unknown',
      departure: routePlan.departureTime?.toISOString(),
      estimatedArrival: routePlan.estimatedArrival?.toISOString(),
      totalDistanceMiles: routePlan.totalDistanceMiles,
      totalDriveTimeHours: routePlan.totalDriveTimeHours,
      totalTripTimeHours: routePlan.totalTripTimeHours,
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
}
