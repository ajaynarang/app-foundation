import { RecurringLaneStatusSchema } from '@sally/shared-types';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

const RECURRING_LANE_STATUS = RecurringLaneStatusSchema.enum;

/**
 * Resolves user-friendly names/numbers to database records.
 * Used by MCP tools that accept driverName, vehicleUnit, or loadNumber params.
 */
export class EntityResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolveLoad(loadNumber: string, tenantId: number) {
    // Normalize: strip "L-" prefix if present, handle bare numbers
    const normalized = loadNumber.replace(/^L-/i, '');
    const load = await this.prisma.load.findFirst({
      where: {
        loadNumber: { contains: normalized, mode: 'insensitive' as const },
        tenantId,
      },
    });
    if (!load) return { error: `Load "${loadNumber}" not found.` };
    return { data: load };
  }

  async resolveDriver(driverName: string, tenantId: number) {
    const drivers = await this.prisma.driver.findMany({
      where: {
        name: { contains: driverName, mode: 'insensitive' as const },
        tenantId,
      },
      take: 5,
    });
    if (drivers.length === 0) return { error: `No driver found matching "${driverName}".` };
    if (drivers.length > 1)
      return {
        error: `Multiple drivers match "${driverName}": ${drivers.map((d) => d.name).join(', ')}. Please be more specific.`,
      };
    return { data: drivers[0] };
  }

  async resolveVehicle(vehicleUnit: string, tenantId: number) {
    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        unitNumber: { contains: vehicleUnit, mode: 'insensitive' as const },
        tenantId,
        lifecycleStatus: 'ACTIVE',
      },
      take: 5,
    });
    if (vehicles.length === 0) return { error: `No vehicle found matching unit "${vehicleUnit}".` };
    if (vehicles.length > 1)
      return {
        error: `Multiple vehicles match "${vehicleUnit}": ${vehicles.map((v) => v.unitNumber).join(', ')}. Please be more specific.`,
      };
    return { data: vehicles[0] };
  }

  async resolveLane(laneName: string | undefined, laneId: number | undefined, tenantId: number) {
    if (laneId) {
      const lane = await this.prisma.recurringLane.findFirst({
        where: { id: laneId, tenantId },
      });
      if (!lane) return { error: `Lane with ID ${laneId} not found.` };
      return { data: lane };
    }
    if (laneName) {
      const lanes = await this.prisma.recurringLane.findMany({
        where: {
          name: { contains: laneName, mode: 'insensitive' as const },
          tenantId,
          status: RECURRING_LANE_STATUS.ACTIVE,
        },
        take: 5,
      });
      if (lanes.length === 0) return { error: `No recurring lane found matching "${laneName}".` };
      if (lanes.length > 1)
        return {
          error: `Multiple lanes match "${laneName}": ${lanes.map((l) => l.name).join(', ')}. Please be more specific.`,
        };
      return { data: lanes[0] };
    }
    return { error: 'Please provide either a lane name or lane ID.' };
  }
}

/**
 * Standard error response for MCP tools.
 */
export function errorResponse(message: string) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
  };
}
