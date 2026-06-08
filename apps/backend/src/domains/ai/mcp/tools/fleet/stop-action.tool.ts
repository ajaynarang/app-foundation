import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { LoadStopStatusSchema, formatLoadLabel } from '@app/shared-types';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { errorResponse } from '../utils/entity-resolver';
import { LoadsService } from '../../../../fleet/loads/services/loads.service';
import { RequiresScope } from '../../../agent-contract/requires-scope.decorator';

const LOAD_STOP_STATUS = LoadStopStatusSchema.enum;

/**
 * The MCP tool exposes the canonical UPPER_SNAKE LoadStopStatus subset directly
 * to the LLM, matching every other status-mutating MCP tool (e.g. update-load-status).
 */
const StopMcpStatusSchema = z.enum([
  LOAD_STOP_STATUS.ARRIVED,
  LOAD_STOP_STATUS.IN_PROGRESS,
  LOAD_STOP_STATUS.COMPLETED,
]);
type StopMcpStatus = z.infer<typeof StopMcpStatusSchema>;

/**
 * Stop Action MCP Tools — driver-persona tools for updating stop status.
 *
 * Identity is resolved from `_userId` (JWT) -> User.driverId -> active load.
 * The AI never controls driver identity — it comes from the authenticated session.
 */
@Injectable()
export class StopActionTool {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loadsService: LoadsService,
  ) {}

  @RequiresScope('loads:write')
  @Tool({
    name: 'update-stop-status',
    description:
      'Update a stop status on your current load: ARRIVED, IN_PROGRESS, or COMPLETED. Auto-detects your active load and finds the target stop. Use when driver says "I arrived at the shipper" or "loading complete." If no stop is specified, uses the next pending/arrived stop. Requires user confirmation before executing.',
    parameters: z.object({
      status: StopMcpStatusSchema.describe('New stop status (UPPER_SNAKE)'),
      stopDescription: z
        .string()
        .max(200)
        .optional()
        .describe(
          'Description of the stop (partial match on stop name/facility). If omitted, uses next pending/arrived stop.',
        ),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async updateStopStatus({
    status,
    stopDescription,
    _tenantId,
    _userId,
  }: {
    status: StopMcpStatus;
    stopDescription?: string;
    _tenantId?: number;
    _userId?: string;
  }) {
    if (!_userId) {
      return errorResponse('No authenticated session found. Please log in and try again.');
    }
    if (!_tenantId) return errorResponse('Session error: no tenant context.');

    // Step 1: Resolve _userId to driver
    const user = await this.prisma.user.findFirst({
      where: { userId: _userId },
      select: { driverId: true, id: true },
    });

    if (!user || !user.driverId) {
      return errorResponse('Your account is not linked to a driver profile. Contact your dispatcher.');
    }

    // Step 2: Find active load for this driver
    const load = await this.prisma.load.findFirst({
      where: {
        driverId: user.driverId,
        status: { in: ['ASSIGNED', 'IN_TRANSIT'] },
        tenantId: _tenantId,
        isActive: true,
      },
      include: {
        stops: {
          include: { stop: true },
          orderBy: { sequenceOrder: 'asc' },
        },
      },
    });

    if (!load) {
      return errorResponse('No active load found. You must have an assigned or in-transit load to update stop status.');
    }

    // Step 3: Find the target stop
    let targetStop;
    if (stopDescription) {
      // Search by stop name/facility using partial match
      targetStop = load.stops.find(
        (ls) =>
          ls.stop?.name?.toLowerCase().includes(stopDescription.toLowerCase()) ||
          ls.stop?.address?.toLowerCase().includes(stopDescription.toLowerCase()) ||
          ls.stop?.city?.toLowerCase().includes(stopDescription.toLowerCase()),
      );

      if (!targetStop) {
        return errorResponse(
          `No stop found matching "${stopDescription}" on load ${load.loadNumber}. Available stops: ${load.stops.map((s) => s.stop?.name || `Stop #${s.sequenceOrder}`).join(', ')}.`,
        );
      }
    } else {
      // Find next pending or arrived stop by sequence
      if (status === LOAD_STOP_STATUS.ARRIVED) {
        targetStop = load.stops.find((ls) => !ls.status || ls.status === LOAD_STOP_STATUS.PENDING);
      } else if (status === LOAD_STOP_STATUS.IN_PROGRESS) {
        targetStop = load.stops.find((ls) => ls.status === LOAD_STOP_STATUS.ARRIVED);
      } else if (status === LOAD_STOP_STATUS.COMPLETED) {
        targetStop = load.stops.find((ls) => ls.status === LOAD_STOP_STATUS.IN_PROGRESS);
      }

      if (!targetStop) {
        return errorResponse(`No stop ready for "${status}" transition on load ${load.loadNumber}.`);
      }
    }

    // Step 4: Call loadsService.updateStopStatus
    try {
      await this.loadsService.updateStopStatus(load.loadNumber, targetStop.id, status, _userId, _tenantId);

      const stopName = targetStop.stop?.name || `Stop #${targetStop.sequenceOrder}`;

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: `Stop "${stopName}" on ${formatLoadLabel(load.loadNumber, load.referenceNumber)} updated to "${status}".`,
              loadNumber: load.loadNumber,
              loadLabel: formatLoadLabel(load.loadNumber, load.referenceNumber),
              stopName,
              status,
            }),
          },
        ],
      };
    } catch (error) {
      return errorResponse(`Failed to update stop status: ${error.message}`);
    }
  }
}
