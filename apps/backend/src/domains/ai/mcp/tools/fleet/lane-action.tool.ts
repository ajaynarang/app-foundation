import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { formatLoadLabel } from '@app/shared-types';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { EntityResolver, errorResponse } from '../utils/entity-resolver';
import { RecurringLanesService } from '../../../../fleet/recurring-lanes/services/recurring-lanes.service';
import { RequiresScope } from '../../../agent-contract/requires-scope.decorator';

/**
 * Lane Action MCP Tools — mutation tools for recurring lane operations.
 *
 * All queries are tenant-scoped via `_tenantId`, which is injected by
 * McpToolService from the authenticated session — NEVER from AI input.
 * The AI cannot see or override the _tenantId parameter.
 */
@Injectable()
export class LaneActionTool {
  private readonly resolver: EntityResolver;

  constructor(
    private readonly prisma: PrismaService,
    private readonly recurringLanesService: RecurringLanesService,
  ) {
    this.resolver = new EntityResolver(prisma);
  }

  @RequiresScope('loads:write')
  @Tool({
    name: 'generate-load-from-lane',
    description:
      'Generate a draft load from a recurring lane. Use when dispatcher says "create a load from the Acme Dallas-Houston lane" or "new load on lane 5." Pre-fills customer, stops, equipment, rate from lane defaults. Requires user confirmation before executing.',
    parameters: z.object({
      laneName: z.string().optional().describe('Recurring lane name (partial match)'),
      laneId: z.number().optional().describe('Recurring lane ID'),
      pickupDate: z.string().optional().describe('Pickup date for the new load (ISO date, e.g. 2026-04-01)'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
    }),
  })
  async generateLoadFromLane({
    laneName,
    laneId,
    pickupDate,
    _tenantId,
  }: {
    laneName?: string;
    laneId?: number;
    pickupDate?: string;
    _tenantId?: number;
  }) {
    if (!_tenantId) return errorResponse('Session error: no tenant context.');

    const result = await this.resolver.resolveLane(laneName, laneId, _tenantId);
    if ('error' in result) return errorResponse(result.error);

    const lane = result.data;

    try {
      const load = await this.recurringLanesService.generateLoad(lane.id, _tenantId);

      // Update pickup date if provided
      if (pickupDate) {
        await this.prisma.load.update({
          where: { id: load.id },
          data: { pickupDate: new Date(pickupDate) },
        });
      }

      const loadLabel = formatLoadLabel(load.loadNumber, (load as { referenceNumber?: string | null }).referenceNumber);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: `Draft load ${loadLabel} created from lane "${lane.name}".`,
              loadNumber: load.loadNumber,
              loadLabel,
              laneName: lane.name,
            }),
          },
        ],
      };
    } catch (error) {
      return errorResponse(`Failed to generate load from lane "${lane.name}": ${error.message}`);
    }
  }
}
