import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { errorResponse } from '../utils/entity-resolver';
import { RequiresScope } from '../../../agent-contract/requires-scope.decorator';

/**
 * Trailer Query MCP Tools — read-only tools for dispatcher trailer data access.
 *
 * All queries are tenant-scoped via `_tenantId`, which is injected by
 * McpToolService from the authenticated session — NEVER from AI input.
 * The AI cannot see or override the _tenantId parameter.
 */
@Injectable()
export class TrailerQueryTool {
  constructor(private readonly prisma: PrismaService) {}

  @RequiresScope('fleet:read')
  @Tool({
    name: 'list-trailers',
    description:
      'Search and list trailers by status, equipment type, or unit number. Use when dispatcher asks "which trailers are available?" or "show me reefer trailers." Do NOT use for a single trailer\'s full details — use get-trailer.',
    parameters: z.object({
      search: z.string().optional().describe('Partial match on unit number'),
      status: z
        .enum(['AVAILABLE', 'ASSIGNED', 'AT_SHIPPER', 'AT_RECEIVER', 'IN_SHOP', 'OUT_OF_SERVICE'])
        .optional()
        .describe('Filter by trailer status'),
      equipmentType: z
        .enum(['DRY_VAN', 'FLATBED', 'REEFER', 'STEP_DECK', 'POWER_ONLY', 'OTHER'])
        .optional()
        .describe('Filter by equipment type'),
      limit: z.number().min(1).max(50).default(20).describe('Max results to return'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
    }),
  })
  async listTrailers({
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

    const [trailers, totalCount] = await Promise.all([
      this.prisma.trailer.findMany({
        where,
        include: {
          assignedVehicle: { select: { unitNumber: true } },
        },
        orderBy: { unitNumber: 'asc' },
        take: limit,
      }),
      this.prisma.trailer.count({ where }),
    ]);

    const trailerList = trailers.map((t: any) => ({
      trailerId: t.trailerId,
      unitNumber: t.unitNumber,
      equipmentType: t.equipmentType,
      status: t.status,
      vin: t.vin,
      licensePlate: t.licensePlate,
      assignedVehicle: t.assignedVehicle?.unitNumber ?? null,
      lengthFeet: t.lengthFeet,
    }));

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            count: trailerList.length,
            totalCount,
            trailers: trailerList,
          }),
        },
      ],
      _card: {
        type: 'trailer_list' as const,
        data: { trailers: trailerList, totalCount },
      },
    };
  }

  @RequiresScope('fleet:read')
  @Tool({
    name: 'get-trailer',
    description:
      'Get full details for a single trailer: unit number, VIN, equipment type, status, license plate, assigned vehicle, dimensions, compliance dates. Use when dispatcher asks about a specific trailer.',
    parameters: z.object({
      trailerUnit: z.string().describe('Unit number or trailer ID to look up (partial match supported)'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
    }),
  })
  async getTrailer({ trailerUnit, _tenantId }: { trailerUnit: string; _tenantId?: number }) {
    if (!_tenantId) return errorResponse('Session error: no tenant context.');

    // Try matching by unitNumber first, then by trailerId
    let trailers: any[] = await this.prisma.trailer.findMany({
      where: {
        tenantId: _tenantId,
        lifecycleStatus: 'ACTIVE',
        unitNumber: { contains: trailerUnit, mode: 'insensitive' as const },
      },
      include: {
        assignedVehicle: {
          select: { vehicleId: true, unitNumber: true },
        },
      },
    });

    // Fall back to trailerId match if no unitNumber match
    if (trailers.length === 0) {
      trailers = await this.prisma.trailer.findMany({
        where: {
          tenantId: _tenantId,
          lifecycleStatus: 'ACTIVE',
          trailerId: { contains: trailerUnit, mode: 'insensitive' as const },
        },
        include: {
          assignedVehicle: {
            select: { vehicleId: true, unitNumber: true },
          },
        },
      });
    }

    if (trailers.length === 0) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: `No active trailer found matching "${trailerUnit}"`,
            }),
          },
        ],
      };
    }

    if (trailers.length > 1) {
      const matches = trailers.map((t) => ({
        trailerId: t.trailerId,
        unitNumber: t.unitNumber,
        equipmentType: t.equipmentType,
        status: t.status,
      }));

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              message: `Multiple trailers match "${trailerUnit}". Please be more specific.`,
              matches,
            }),
          },
        ],
      };
    }

    const t = trailers[0];
    const trailerData = {
      trailerId: t.trailerId,
      unitNumber: t.unitNumber,
      equipmentType: t.equipmentType,
      vin: t.vin,
      licensePlate: t.licensePlate,
      licensePlateState: t.licensePlateState,
      make: t.make,
      model: t.model,
      year: t.year,
      lengthFeet: t.lengthFeet,
      maxPayloadLbs: t.maxPayloadLbs,
      ownershipType: t.ownershipType,
      reeferMake: t.reeferMake,
      reeferModel: t.reeferModel,
      reeferSerial: t.reeferSerial,
      status: t.status,
      assignedVehicle: t.assignedVehicle
        ? {
            vehicleId: t.assignedVehicle.vehicleId,
            unitNumber: t.assignedVehicle.unitNumber,
          }
        : null,
      registrationExpiry: t.registrationExpiry ? t.registrationExpiry.toISOString().split('T')[0] : null,
      insuranceExpiry: t.insuranceExpiry ? t.insuranceExpiry.toISOString().split('T')[0] : null,
      annualInspectionDate: t.annualInspectionDate ? t.annualInspectionDate.toISOString().split('T')[0] : null,
      nextMaintenanceDate: t.nextMaintenanceDate ? t.nextMaintenanceDate.toISOString().split('T')[0] : null,
      notes: t.notes,
    };

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(trailerData),
        },
      ],
      _card: { type: 'trailer_detail' as const, data: trailerData },
    };
  }

  @RequiresScope('fleet:read')
  @Tool({
    name: 'find-available-trailer',
    description:
      'Find an available trailer matching a specific equipment type. Use when dispatcher asks "find me a reefer trailer" or "is there a flatbed available?" Returns the first available match.',
    parameters: z.object({
      equipmentType: z
        .enum(['DRY_VAN', 'FLATBED', 'REEFER', 'STEP_DECK', 'POWER_ONLY', 'OTHER'])
        .describe('Required equipment type to search for'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
    }),
  })
  async findAvailableTrailer({ equipmentType, _tenantId }: { equipmentType: string; _tenantId?: number }) {
    if (!_tenantId) return errorResponse('Session error: no tenant context.');

    const trailer: any = await this.prisma.trailer.findFirst({
      where: {
        tenantId: _tenantId,
        status: 'AVAILABLE',
        lifecycleStatus: 'ACTIVE',
        equipmentType: equipmentType as any,
      },
      include: {
        assignedVehicle: {
          select: { vehicleId: true, unitNumber: true },
        },
      },
      orderBy: { unitNumber: 'asc' },
    });

    if (!trailer) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: `No available ${equipmentType} trailer found.`,
            }),
          },
        ],
      };
    }

    const trailerData = {
      trailerId: trailer.trailerId,
      unitNumber: trailer.unitNumber,
      equipmentType: trailer.equipmentType,
      status: trailer.status,
      vin: trailer.vin,
      licensePlate: trailer.licensePlate,
      lengthFeet: trailer.lengthFeet,
      maxPayloadLbs: trailer.maxPayloadLbs,
    };

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            message: `Found available ${equipmentType} trailer: ${trailer.unitNumber}`,
            trailer: trailerData,
          }),
        },
      ],
      _card: { type: 'trailer_detail' as const, data: trailerData },
    };
  }
}
