import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { SettlementsService } from '../../../financials/settlements/services/settlements.service';
import { RequiresScope } from '../../agent-contract/requires-scope.decorator';

/**
 * Settlement Action MCP Tools — write tools for settlement mutations.
 *
 * All mutations are tenant-scoped via `_tenantId`, which is injected by
 * McpToolService from the authenticated session — NEVER from AI input.
 *
 * Write operations: approve-settlement (requires HITL confirmation)
 *
 * Write tools have description instructions telling the AI to confirm
 * with the user before calling. This is the HITL confirmation pattern.
 */
@Injectable()
export class SettlementActionTool {
  constructor(private readonly settlementsService: SettlementsService) {}

  @RequiresScope('settlements:write:sensitive')
  @Tool({
    name: 'approve-settlement',
    description:
      'Approve a draft settlement, changing its status from DRAFT to APPROVED. Once approved, the settlement is ready to be paid. IMPORTANT: Always confirm with the user before calling this tool. Tell them which settlement you are about to approve, including the driver name and net pay amount, and ask for explicit confirmation.',
    parameters: z.object({
      settlementId: z.string().describe('The settlement ID (e.g. stl_abc123)'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async approveSettlement({
    settlementId,
    _tenantId,
    _userId,
  }: {
    settlementId: string;
    _tenantId?: number;
    _userId?: string;
  }) {
    if (!_tenantId) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: 'No tenant context' }),
          },
        ],
      };
    }

    try {
      const settlement = (await this.settlementsService.approve(
        _tenantId,
        settlementId,
        _userId ? parseInt(_userId, 10) : undefined,
      )) as any;

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              settlementId,
              settlementNumber: settlement.settlementNumber,
              status: 'APPROVED',
              driverName: settlement.driver?.name ?? 'Unknown',
              netPayDollars: (settlement.netPayCents / 100).toFixed(2),
              message: `Settlement ${settlement.settlementNumber} has been approved`,
            }),
          },
        ],
      };
    } catch (e: any) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: e.message }),
          },
        ],
      };
    }
  }
}
