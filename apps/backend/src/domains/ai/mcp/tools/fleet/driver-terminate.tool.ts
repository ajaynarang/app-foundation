import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { DriversActivationService } from '../../../../fleet/drivers/services/drivers-activation.service';
import { EntityResolver, errorResponse } from '../utils/entity-resolver';
import { RequiresScope } from '../../../agent-contract/requires-scope.decorator';
import { ToolNames } from '../../../agent-contract/tool-names.constants';

/**
 * Terminate-Driver MCP Tool — deactivates a driver, preventing future load assignments.
 *
 * Tenant isolation:
 *   - _tenantId is injected by McpToolService from the authenticated session.
 *     Never accepted from the LLM. Absent = early error before service call.
 *
 * Scope:
 *   RequiresScope('fleet:write:sensitive') — sensitive tier; pipeline handles
 *   HITL step-up for external principals automatically.
 *
 * Delegates to DriversActivationService.deactivateDriver which enforces no
 * active loads and no active route plans before setting status=INACTIVE.
 * Unsettled pay is NOT auto-settled — dispatcher must use create-settlement.
 */

const TerminateDriverSchema = z.object({
  driverName: z.string().min(1).describe('Driver name or partial match'),
  reason: z.string().min(5).max(500).describe('Why this driver is being terminated (audit log)'),
  _tenantId: z.number().optional().describe('Internal: injected by system'),
  _userId: z.string().optional().describe('Internal: injected by system'),
});

type TerminateDriverArgs = z.infer<typeof TerminateDriverSchema>;

@Injectable()
export class DriverTerminateTool {
  private readonly resolver: EntityResolver;

  constructor(
    private readonly prisma: PrismaService,
    private readonly driversActivationService: DriversActivationService,
  ) {
    this.resolver = new EntityResolver(prisma);
  }

  @RequiresScope('fleet:write:sensitive')
  @Tool({
    name: ToolNames.TERMINATE_DRIVER,
    description:
      'Terminate a driver, preventing future load assignments. Use when admin says "terminate driver Smith — he quit" or "let John go." Driver must have no in-flight loads (ASSIGNED / IN_TRANSIT / ON_HOLD) and no active route plans. If the driver has unsettled pay, create a final settlement via create-settlement separately — this tool does NOT auto-settle. This is a sensitive, audited action requiring step-up confirmation for external agents. Requires user confirmation before executing.',
    parameters: TerminateDriverSchema,
  })
  async terminateDriver(args: TerminateDriverArgs) {
    const { _tenantId, _userId, driverName, reason } = args;

    if (!_tenantId) return errorResponse('Session error: no tenant context.');
    if (!_userId)
      return errorResponse('Session error: no user context. Sensitive writes must be attributable to a user.');

    const user = await this.prisma.user.findFirst({
      where: { userId: _userId, tenantId: _tenantId },
      select: { id: true },
    });
    if (!user) return errorResponse('Acting user not found.');

    const res = await this.resolver.resolveDriver(driverName, _tenantId);
    if ('error' in res) return errorResponse(res.error);

    const driver = res.data;
    const currentUser = { id: user.id, tenant: { id: _tenantId } };

    try {
      await this.driversActivationService.deactivateDriver(driver.driverId, currentUser, reason);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              driverId: driver.driverId,
              name: driver.name,
              message: `Driver ${driver.name} terminated. Reminder: if this driver has unsettled pay, create a final settlement via create-settlement.`,
            }),
          },
        ],
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : (error?.response?.message ?? 'Failed to terminate driver.');
      return errorResponse(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
  }
}
