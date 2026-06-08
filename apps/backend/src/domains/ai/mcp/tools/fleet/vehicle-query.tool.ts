import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { errorResponse } from '../utils/entity-resolver';
import { RequiresScope } from '../../../agent-contract/requires-scope.decorator';

/**
 * Vehicle Query MCP Tools — read-only tools for dispatcher vehicle data access.
 *
 * All queries are tenant-scoped via `_tenantId`, which is injected by
 * McpToolService from the authenticated session — NEVER from AI input.
 * The AI cannot see or override the _tenantId parameter.
 */
@Injectable()
export class VehicleQueryTool {
  constructor(private readonly prisma: PrismaService) {}

  @RequiresScope('fleet:read')
  @Tool({
    name: 'query-vehicles',
    description:
      'Search and list vehicles by status, type, or unit number. Use when dispatcher asks "which trucks are available?" or "show me flatbeds." Do NOT use for a single vehicle\'s full details — use get-vehicle-detail.',
    parameters: z.object({
      search: z.string().optional().describe('Partial match on unit number'),
      status: z
        .enum(['AVAILABLE', 'ASSIGNED', 'IN_SHOP', 'OUT_OF_SERVICE'])
        .optional()
        .describe('Filter by vehicle status'),
      equipmentType: z.string().optional().describe('Filter by equipment type (e.g., DRY_VAN, FLATBED, REEFER)'),
      limit: z.number().min(1).max(50).default(20).describe('Max results to return'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
    }),
  })
  async queryVehicles({
    search,
    status,
    equipmentType,
    limit,
    _tenantId,
  }: {
    search?: string;
    status?: string;
    equipmentType?: string;
    limit: number;
    _tenantId?: number;
  }) {
    if (!_tenantId) return errorResponse('Session error: no tenant context.');

    const where: any = {
      tenantId: _tenantId,
      lifecycleStatus: 'ACTIVE',
      ...(search && {
        unitNumber: { contains: search, mode: 'insensitive' as const },
      }),
      ...(status && { status }),
      ...(equipmentType && { equipmentType }),
    };

    const [vehicles, totalCount] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        include: {
          assignedDriver: { select: { name: true } },
        },
        orderBy: { unitNumber: 'asc' },
        take: limit,
      }),
      this.prisma.vehicle.count({ where }),
    ]);

    const vehicleList = vehicles.map((v: any) => ({
      vehicleId: v.vehicleId,
      unitNumber: v.unitNumber,
      make: v.make,
      model: v.model,
      year: v.year,
      equipmentType: v.equipmentType,
      status: v.status,
      assignedDriver: v.assignedDriver?.name ?? null,
      currentFuelGallons: v.currentFuelGallons,
      fuelCapacityGallons: v.fuelCapacityGallons,
    }));

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            count: vehicleList.length,
            totalCount,
            vehicles: vehicleList,
          }),
        },
      ],
      _card: {
        type: 'vehicle_list' as const,
        data: { vehicles: vehicleList, totalCount },
      },
    };
  }

  @RequiresScope('fleet:read')
  @Tool({
    name: 'get-vehicle-detail',
    description:
      'Get full details for a single vehicle: unit number, VIN, make/model/year, equipment type, status, fuel level, mileage, assigned driver, license plate. Use when dispatcher asks about a specific truck.',
    parameters: z.object({
      vehicleUnit: z.string().describe('Unit number to look up (partial match supported)'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
    }),
  })
  async getVehicleDetail({ vehicleUnit, _tenantId }: { vehicleUnit: string; _tenantId?: number }) {
    if (!_tenantId) return errorResponse('Session error: no tenant context.');

    const vehicles: any[] = await this.prisma.vehicle.findMany({
      where: {
        tenantId: _tenantId,
        lifecycleStatus: 'ACTIVE',
        unitNumber: { contains: vehicleUnit, mode: 'insensitive' as const },
      } as any,
      include: {
        assignedDriver: { select: { name: true } },
        telematics: { select: { odometer: true } },
      },
    });

    if (vehicles.length === 0) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: `No active vehicle found matching unit "${vehicleUnit}"`,
            }),
          },
        ],
      };
    }

    if (vehicles.length > 1) {
      const matches = vehicles.map((v) => ({
        vehicleId: v.vehicleId,
        unitNumber: v.unitNumber,
        make: v.make,
        model: v.model,
        status: v.status,
      }));

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              message: `Multiple vehicles match "${vehicleUnit}". Please be more specific.`,
              matches,
            }),
          },
        ],
      };
    }

    const v = vehicles[0];
    const vehicleData = {
      vehicleId: v.vehicleId,
      unitNumber: v.unitNumber,
      make: v.make,
      model: v.model,
      year: v.year,
      vin: v.vin,
      equipmentType: v.equipmentType,
      status: v.status,
      fuelCapacityGallons: v.fuelCapacityGallons,
      currentFuelGallons: v.currentFuelGallons,
      odometerMiles: v.telematics?.odometer ?? null,
      assignedDriver: v.assignedDriver?.name ?? null,
      licensePlate: v.licensePlate,
      licensePlateState: v.licensePlateState,
    };

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(vehicleData),
        },
      ],
      _card: { type: 'vehicle_detail' as const, data: vehicleData },
    };
  }
}
