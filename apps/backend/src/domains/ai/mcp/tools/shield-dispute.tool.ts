/**
 * Dispute-Shield-Finding MCP Tool — marks a Shield compliance finding as disputed.
 *
 * Tenant isolation:
 *   - _tenantId is injected by McpToolService from the authenticated session.
 *     Never accepted from the LLM. Absent = early error before service call.
 *
 * Scope:
 *   RequiresScope('shield:write') — write tier; pipeline handles HITL step-up
 *   for external principals automatically.
 *
 * Delegates to ShieldService.disputeFinding which validates finding state
 * (not resolved, not already disputed) and records the dispute with the
 * acting user id, timestamp, and reason for audit purposes.
 */
import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { ShieldService } from '../../../operations/shield/services/shield.service';
import { errorResponse } from './utils/entity-resolver';
import { RequiresScope } from '../../agent-contract/requires-scope.decorator';
import { ToolNames } from '../../agent-contract/tool-names.constants';

const DisputeShieldFindingSchema = z.object({
  findingId: z.string().min(1).describe('Shield finding ID (cuid), e.g. "clxxx..."'),
  reason: z.string().min(10).max(1000).describe('Why this finding is disputed — min 10 chars (audit log)'),
  _tenantId: z.number().optional().describe('Internal: injected by system'),
  _userId: z.string().optional().describe('Internal: injected by system'),
});

type DisputeShieldFindingArgs = z.infer<typeof DisputeShieldFindingSchema>;

@Injectable()
export class ShieldDisputeTool {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shieldService: ShieldService,
  ) {}

  @RequiresScope('shield:write')
  @Tool({
    name: ToolNames.DISPUTE_SHIELD_FINDING,
    description:
      'Dispute a Shield compliance finding. Use when dispatcher or admin says "dispute the HOS violation on finding F-2026-042 — that was a clock glitch, driver was actually off duty" or "contest the speeding finding, driver was on private property." The finding moves to `disputed` status; Shield review team re-evaluates. Finding must not be resolved (reopen via UI first if needed). Do NOT use to resolve a finding that\'s not contested. Requires user confirmation before executing.',
    parameters: DisputeShieldFindingSchema,
  })
  async disputeShieldFinding(args: DisputeShieldFindingArgs) {
    const { _tenantId, _userId, findingId, reason } = args;

    if (!_tenantId) return errorResponse('Session error: no tenant context.');
    if (!_userId) return errorResponse('Session error: no user context. Writes must be attributable to a user.');

    const user = await this.prisma.user.findFirst({
      where: { userId: _userId, tenantId: _tenantId },
      select: { id: true },
    });
    if (!user) return errorResponse('Acting user not found.');

    try {
      await this.shieldService.disputeFinding(_tenantId, findingId, user.id, reason);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              findingId,
              message: `Shield finding ${findingId} disputed. Shield review will re-evaluate.`,
            }),
          },
        ],
      };
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : (error?.response?.message ?? 'Failed to dispute shield finding.');
      return errorResponse(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
  }
}
