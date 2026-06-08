import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { EntityResolver, errorResponse } from '../utils/entity-resolver';
import { TrailersService } from '../../../../fleet/trailers/services/trailers.service';
import { RequiresScope } from '../../../agent-contract/requires-scope.decorator';

/**
 * Trailer Action MCP Tools — mutation tools for trailer assignment operations.
 *
 * All queries are tenant-scoped via `_tenantId`, which is injected by
 * McpToolService from the authenticated session — NEVER from AI input.
 * The AI cannot see or override the _tenantId parameter.
 */
@Injectable()
export class TrailerActionTool {
  private readonly resolver: EntityResolver;

  constructor(
    private readonly prisma: PrismaService,
    private readonly trailersService: TrailersService,
  ) {
    this.resolver = new EntityResolver(prisma);
  }

  @RequiresScope('fleet:write')
  @Tool({
    name: 'assign-trailer-to-vehicle',
    description:
      'Assign (hook) a trailer to a vehicle. Use when dispatcher says "hook trailer T-201 to truck 101" or "assign reefer trailer to vehicle T-500." Requires user confirmation before executing.',
    parameters: z.object({
      trailerId: z.string().describe('Trailer unit number or trailer ID, e.g. "T-201" or "TRL-ABC123"'),
      vehicleId: z.string().describe('Vehicle unit number, e.g. "T-101" or "101"'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
    }),
  })
  async assignTrailerToVehicle({
    trailerId,
    vehicleId,
    _tenantId,
  }: {
    trailerId: string;
    vehicleId: string;
    _tenantId?: number;
  }) {
    if (!_tenantId) return errorResponse('Session error: no tenant context.');

    // Resolve trailer by unitNumber or trailerId
    const trailer = await this.resolveTrailer(trailerId, _tenantId);
    if ('error' in trailer) return errorResponse(trailer.error);

    // Resolve vehicle
    const vehicleResult = await this.resolver.resolveVehicle(vehicleId, _tenantId);
    if ('error' in vehicleResult) return errorResponse(vehicleResult.error);

    const vehicle = vehicleResult.data;

    try {
      await this.trailersService.assignVehicle(trailer.data.trailerId, _tenantId, vehicle.id);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: `Trailer ${trailer.data.unitNumber} assigned to vehicle ${vehicle.unitNumber}.`,
              trailerId: trailer.data.trailerId,
              trailerUnit: trailer.data.unitNumber,
              vehicleId: vehicle.vehicleId,
              vehicleUnit: vehicle.unitNumber,
            }),
          },
        ],
      };
    } catch (error) {
      return errorResponse(
        `Failed to assign trailer ${trailer.data.unitNumber} to vehicle ${vehicle.unitNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  @RequiresScope('fleet:write')
  @Tool({
    name: 'unassign-trailer',
    description:
      'Unassign (unhook) a trailer from its current vehicle. Use when dispatcher says "unhook trailer T-201" or "drop trailer from truck 101." Requires user confirmation before executing.',
    parameters: z.object({
      trailerId: z.string().describe('Trailer unit number or trailer ID, e.g. "T-201" or "TRL-ABC123"'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
    }),
  })
  async unassignTrailer({ trailerId, _tenantId }: { trailerId: string; _tenantId?: number }) {
    if (!_tenantId) return errorResponse('Session error: no tenant context.');

    // Resolve trailer by unitNumber or trailerId
    const trailer = await this.resolveTrailer(trailerId, _tenantId);
    if ('error' in trailer) return errorResponse(trailer.error);

    try {
      await this.trailersService.unassignVehicle(trailer.data.trailerId, _tenantId);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: `Trailer ${trailer.data.unitNumber} has been unassigned from its vehicle.`,
              trailerId: trailer.data.trailerId,
              trailerUnit: trailer.data.unitNumber,
            }),
          },
        ],
      };
    } catch (error) {
      return errorResponse(
        `Failed to unassign trailer ${trailer.data.unitNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Resolve a trailer by unitNumber or trailerId within the tenant scope.
   */
  private async resolveTrailer(trailerRef: string, tenantId: number): Promise<{ data: any } | { error: string }> {
    // Try unitNumber first
    let trailers = await this.prisma.trailer.findMany({
      where: {
        unitNumber: { contains: trailerRef, mode: 'insensitive' as const },
        tenantId,
        lifecycleStatus: 'ACTIVE',
      },
      take: 5,
    });

    // Fall back to trailerId
    if (trailers.length === 0) {
      trailers = await this.prisma.trailer.findMany({
        where: {
          trailerId: { contains: trailerRef, mode: 'insensitive' as const },
          tenantId,
          lifecycleStatus: 'ACTIVE',
        },
        take: 5,
      });
    }

    if (trailers.length === 0) {
      return { error: `No active trailer found matching "${trailerRef}".` };
    }
    if (trailers.length > 1) {
      return {
        error: `Multiple trailers match "${trailerRef}": ${trailers.map((t) => t.unitNumber).join(', ')}. Please be more specific.`,
      };
    }
    return { data: trailers[0] };
  }
}
