import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { errorResponse } from '../utils/entity-resolver';
import { RequiresScope } from '../../../agent-contract/requires-scope.decorator';

/**
 * Driver Query MCP Tools — read-only tools for dispatcher driver data access.
 *
 * All queries are tenant-scoped via `_tenantId`, which is injected by
 * McpToolService from the authenticated session — NEVER from AI input.
 * The AI cannot see or override the _tenantId parameter.
 */
@Injectable()
export class DriverQueryTool {
  constructor(private readonly prisma: PrismaService) {}

  @RequiresScope('fleet:read')
  @Tool({
    name: 'query-drivers',
    description:
      'Search and list drivers by status, name, or availability. Use when dispatcher asks "who\'s available?", "show me all drivers", or "find a driver." Do NOT use for HOS — use get-driver-hos. Do NOT use for a single driver\'s full profile — use get-driver-detail.',
    parameters: z.object({
      search: z.string().optional().describe('Search by driver name (partial match)'),
      status: z.enum(['ACTIVE', 'INACTIVE', 'PENDING_ACTIVATION']).optional().describe('Filter by driver status'),
      availableOnly: z
        .boolean()
        .optional()
        .describe('If true, only return drivers not currently assigned to an active load'),
      limit: z.number().min(1).max(50).default(20).describe('Max results to return'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
    }),
  })
  async queryDrivers({
    search,
    status,
    availableOnly,
    limit,
    _tenantId,
  }: {
    search?: string;
    status?: 'ACTIVE' | 'INACTIVE' | 'PENDING_ACTIVATION';
    availableOnly?: boolean;
    limit: number;
    _tenantId?: number;
  }) {
    if (!_tenantId) return errorResponse('Session error: no tenant context.');

    // Build where clause
    const where: Record<string, unknown> = {};

    where.tenantId = _tenantId;

    if (status) {
      where.status = status;
    }

    if (search) {
      where.name = { contains: search, mode: 'insensitive' as const };
    }

    // If availableOnly, exclude drivers with active loads (assigned or in_transit)
    if (availableOnly) {
      where.loads = {
        none: {
          status: { in: ['ASSIGNED', 'IN_TRANSIT'] },
        },
      };
    }

    const drivers = await this.prisma.driver.findMany({
      where,
      include: {
        assignedVehicle: {
          select: { unitNumber: true },
        },
      },
      orderBy: { name: 'asc' },
      take: limit,
    });

    const mappedDrivers = drivers.map((d) => ({
      driverId: d.driverId,
      name: d.name,
      status: d.status,
      phone: d.phone,
      email: d.email,
      assignedVehicle: d.assignedVehicle?.unitNumber ?? null,
    }));

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            count: mappedDrivers.length,
            drivers: mappedDrivers,
          }),
        },
      ],
      _card: {
        type: 'driver_list' as const,
        data: {
          drivers: mappedDrivers,
          totalCount: mappedDrivers.length,
        },
      },
    };
  }

  @RequiresScope('fleet:read')
  @Tool({
    name: 'get-driver-detail',
    description:
      'Get full profile for a single driver: contact, CDL, medical card expiry, assigned vehicle, hire date, notes. Use when dispatcher asks about a specific driver\'s info like "tell me about driver John." Do NOT use for HOS — use get-driver-hos. Do NOT use for pay — use get-driver-pay-structure.',
    parameters: z.object({
      driverName: z.string().describe('Driver name to look up (partial match supported)'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
    }),
  })
  async getDriverDetail({ driverName, _tenantId }: { driverName: string; _tenantId?: number }) {
    if (!_tenantId) return errorResponse('Session error: no tenant context.');

    const drivers = await this.prisma.driver.findMany({
      where: {
        tenantId: _tenantId,
        name: { contains: driverName, mode: 'insensitive' as const },
      },
      include: {
        assignedVehicle: {
          select: { unitNumber: true },
        },
      },
    });

    if (drivers.length === 0) {
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

    if (drivers.length > 1) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: `Multiple drivers match "${driverName}". Please be more specific.`,
              matches: drivers.map((d) => d.name),
            }),
          },
        ],
      };
    }

    const d = drivers[0];

    const detail = {
      driverId: d.driverId,
      name: d.name,
      status: d.status,
      phone: d.phone,
      email: d.email,
      licenseNumber: d.licenseNumber,
      licenseState: d.licenseState,
      cdlClass: d.cdlClass,
      endorsements: d.endorsements,
      hireDate: d.hireDate?.toISOString() ?? null,
      medicalCardExpiry: d.medicalCardExpiry?.toISOString() ?? null,
      emergencyContactName: d.emergencyContactName,
      emergencyContactPhone: d.emergencyContactPhone,
      assignedVehicle: d.assignedVehicle?.unitNumber ?? null,
      notes: d.notes,
    };

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(detail),
        },
      ],
      _card: { type: 'driver_detail' as const, data: detail },
    };
  }
}
