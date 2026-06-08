import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { VehiclesService } from '../../../../fleet/vehicles/services/vehicles.service';
import { EntityResolver, errorResponse } from '../utils/entity-resolver';
import { RequiresScope } from '../../../agent-contract/requires-scope.decorator';
import { ToolNames } from '../../../agent-contract/tool-names.constants';

/**
 * Retire-Vehicle MCP Tool — permanently decommissions a vehicle, blocking future loads.
 *
 * Tenant isolation:
 *   - _tenantId is injected by McpToolService from the authenticated session.
 *     Never accepted from the LLM. Absent = early error before service call.
 *
 * Scope:
 *   RequiresScope('fleet:write:sensitive') — sensitive tier; pipeline handles
 *   HITL step-up for external principals automatically.
 *
 * Name note: "retire" is business language; the service method is "decommission"
 * (system language). VehiclesService.decommission enforces the safety check
 * (no active loads, no assigned driver) before setting lifecycleStatus=DECOMMISSIONED.
 */

const RetireVehicleSchema = z.object({
  unitNumber: z.string().min(1).describe('Vehicle unit number, e.g. "T-101"'),
  reason: z.string().min(5).max(500).describe('Why this vehicle is being retired (audit log)'),
  _tenantId: z.number().optional().describe('Internal: injected by system'),
  _userId: z.string().optional().describe('Internal: injected by system'),
});

type RetireVehicleArgs = z.infer<typeof RetireVehicleSchema>;

@Injectable()
export class VehicleRetireTool {
  private readonly resolver: EntityResolver;

  constructor(
    private readonly prisma: PrismaService,
    private readonly vehiclesService: VehiclesService,
  ) {
    this.resolver = new EntityResolver(prisma);
  }

  @RequiresScope('fleet:write:sensitive')
  @Tool({
    name: ToolNames.RETIRE_VEHICLE,
    description:
      'Retire a vehicle permanently, marking it unavailable for future loads. Use when admin says "retire truck T-101 — it was totaled" or "decommission trailer T-201 — it\'s scrapped." Vehicle must have no assigned driver and no active loads. This is a sensitive, audited action requiring step-up confirmation for external agents. NOT reversible through the API — contact support to reinstate. Requires user confirmation before executing.',
    parameters: RetireVehicleSchema,
  })
  async retireVehicle(args: RetireVehicleArgs) {
    const { _tenantId, _userId, unitNumber, reason } = args;

    if (!_tenantId) return errorResponse('Session error: no tenant context.');
    if (!_userId)
      return errorResponse('Session error: no user context. Sensitive writes must be attributable to a user.');

    const user = await this.prisma.user.findFirst({
      where: { userId: _userId, tenantId: _tenantId },
      select: { id: true },
    });
    if (!user) return errorResponse('Acting user not found.');

    const res = await this.resolver.resolveVehicle(unitNumber, _tenantId);
    if ('error' in res) return errorResponse(res.error);

    const vehicle = res.data;

    try {
      await this.vehiclesService.decommission(vehicle.vehicleId, _tenantId, user.id, reason);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              vehicleId: vehicle.vehicleId,
              unitNumber: vehicle.unitNumber,
              message: `Vehicle ${vehicle.unitNumber} retired. It cannot be assigned to future loads. Not reversible through the API — contact support to un-retire.`,
            }),
          },
        ],
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : (error?.response?.message ?? 'Failed to retire vehicle.');
      return errorResponse(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
  }
}
