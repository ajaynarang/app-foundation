import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { SettlementsService } from '../../../financials/settlements/services/settlements.service';
import { EntityResolver, errorResponse } from './utils/entity-resolver';
import { RequiresScope } from '../../agent-contract/requires-scope.decorator';
import { ToolNames } from '../../agent-contract/tool-names.constants';

/**
 * Create-Settlement MCP Tool — creates a DRAFT settlement for a driver.
 *
 * Tenant isolation:
 *   - _tenantId is injected by McpToolService from the authenticated session.
 *     Never sourced from the LLM. Absent = early error.
 *
 * Scope:
 *   - RequiresScope('settlements:write') — standard HITL tier.
 *
 * Name note: the tool is named "create-settlement" because "calculate" is a
 * misleading API surface for the agent. Internally calls
 * SettlementsService.calculate with preview: false (persists a DRAFT row).
 *
 * Driver resolution: accepts a human-readable driverName and resolves it to
 * driverId via EntityResolver before calling the service.
 */

const CreateSettlementSchema = z.object({
  driverName: z.string().min(1).describe('Driver name or partial match, e.g. "John Smith"'),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Period start must be YYYY-MM-DD'),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Period end must be YYYY-MM-DD'),
  _tenantId: z.number().optional().describe('Internal: injected by system'),
  // _userId accepted for future provenance tracking; SettlementsService.calculate doesn't persist it.
  _userId: z.string().optional().describe('Internal: injected by system'),
});

type CreateSettlementArgs = z.infer<typeof CreateSettlementSchema>;

@Injectable()
export class SettlementCreateTool {
  private readonly resolver: EntityResolver;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settlementsService: SettlementsService,
  ) {
    this.resolver = new EntityResolver(prisma);
  }

  @RequiresScope('settlements:write')
  @Tool({
    name: ToolNames.CREATE_SETTLEMENT,
    description:
      'Create a DRAFT settlement for a driver over a pay period. Use when dispatcher says "run payroll for Smith from 4/12 to 4/18" or "calculate settlement for John, week ending Sunday." Settlement is DRAFT — approve-settlement finalizes. Driver must have delivered loads in the period with an active pay structure. Requires user confirmation before executing.',
    parameters: CreateSettlementSchema,
  })
  async createSettlement(args: CreateSettlementArgs) {
    const { _tenantId, _userId: _, driverName, periodStart, periodEnd } = args;

    if (!_tenantId) return errorResponse('Session error: no tenant context.');

    const res = await this.resolver.resolveDriver(driverName, _tenantId);
    if ('error' in res) return errorResponse(res.error);

    const driver = res.data;

    try {
      // preview is omitted (falsy) so the service persists a DRAFT row.
      // The non-preview branch always returns a persisted settlement with settlementId.
      const result = (await this.settlementsService.calculate(_tenantId, {
        driverId: driver.driverId,
        periodStart,
        periodEnd,
      })) as { settlementId: string; grossPayCents: number };
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              settlementId: result.settlementId,
              driverName: driver.name,
              periodStart,
              periodEnd,
              grossPayCents: result.grossPayCents,
              message: `Settlement for ${driver.name} (${periodStart} → ${periodEnd}) created in DRAFT. Use approve-settlement to finalize.`,
            }),
          },
        ],
      };
    } catch (error) {
      return errorResponse(error instanceof Error ? error.message : 'Failed to create settlement.');
    }
  }
}
