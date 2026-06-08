import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { formatLoadLabel } from '@sally/shared-types';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { errorResponse } from '../utils/entity-resolver';
import { LoadsService } from '../../../../fleet/loads/services/loads.service';
import { RequiresScope } from '../../../agent-contract/requires-scope.decorator';
import { ToolNames } from '../../../agent-contract/tool-names.constants';

/**
 * Accept-Ratecon-Draft MCP Tool — promotes a parsed rate-con DRAFT load to PENDING.
 *
 * Tenant isolation:
 *   - _tenantId is injected by McpToolService from the authenticated session.
 *     Never accepted from the LLM. Tool enforces tenant scoping on the Prisma
 *     lookup before delegating to LoadsService.
 *
 * Scope:
 *   - RequiresScope('loads:write') — shared with create-load and update-load.
 *     Standard HITL tier for external principals (OAuth / API key).
 *
 * Flow:
 *   1. Load is fetched by (loadNumber, tenantId). Must be in DRAFT.
 *   2. Optional edits applied via LoadsService.updateDraft.
 *   3. Status transition DRAFT → PENDING via LoadsService.updateStatus.
 */

const AcceptRateconDraftSchema = z.object({
  loadNumber: z.string().describe('Load number of the DRAFT load, e.g. "LD-20260420-001"'),
  rateCents: z.number().int().min(0).optional().describe('Override the parsed rate in cents before promoting'),
  commodity: z.string().optional().describe('Override commodity before promoting'),
  weightLbs: z.number().int().min(0).optional().describe('Override weight in pounds before promoting'),
  referenceNumber: z.string().optional().describe('Override BOL / broker reference number'),
  specialRequirements: z.string().optional(),
  _tenantId: z.number().optional().describe('Internal: injected by system'),
  // _userId accepted for future provenance tracking on AgentInvocationLog; LoadsService.updateStatus doesn't persist it today.
  _userId: z.string().optional().describe('Internal: injected by system'),
});

type AcceptRateconDraftArgs = z.infer<typeof AcceptRateconDraftSchema>;

@Injectable()
export class RateconAcceptTool {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loadsService: LoadsService,
  ) {}

  private buildEditPayload(args: AcceptRateconDraftArgs) {
    const { rateCents, commodity, weightLbs, referenceNumber, specialRequirements } = args;
    const edits: Record<string, unknown> = {};
    if (rateCents !== undefined) edits.rateCents = rateCents;
    if (commodity !== undefined) edits.commodityType = commodity;
    if (weightLbs !== undefined) edits.weightLbs = weightLbs;
    if (referenceNumber !== undefined) edits.referenceNumber = referenceNumber;
    if (specialRequirements !== undefined) edits.specialRequirements = specialRequirements;
    return Object.keys(edits).length > 0 ? edits : null;
  }

  @RequiresScope('loads:write')
  @Tool({
    name: ToolNames.ACCEPT_RATECON_DRAFT,
    description:
      'Promote a parsed rate-confirmation draft load to PENDING status. Use after a rate-con PDF has been uploaded and parsed into a DRAFT load, when the dispatcher says "accept the rate-con for LD-20260420-001" or "confirm the Acme load from the PDF." Optionally override rate, commodity, weight, or reference number before promoting. Do NOT use to create a load from scratch (use create-load). Do NOT use to move a load past PENDING (use update-load-status or assign-load). Requires user confirmation before executing.',
    parameters: AcceptRateconDraftSchema,
  })
  async acceptRateconDraft(args: AcceptRateconDraftArgs) {
    const { loadNumber, _tenantId } = args;

    if (!_tenantId) return errorResponse('Session error: no tenant context.');

    const load = await this.prisma.load.findFirst({
      where: { loadNumber, tenantId: _tenantId },
      select: { loadNumber: true, status: true },
    });

    if (!load) return errorResponse(`Load ${loadNumber} not found.`);

    if (load.status !== 'DRAFT') {
      return errorResponse(
        `Load ${loadNumber} is in status ${load.status}; only DRAFT loads can be promoted via accept-ratecon-draft.`,
      );
    }

    try {
      const edits = this.buildEditPayload(args);
      if (edits) {
        await this.loadsService.updateDraft(load.loadNumber, edits);
      }

      await this.loadsService.updateStatus(load.loadNumber, 'PENDING');

      const updated = await this.loadsService.findOne(load.loadNumber, _tenantId);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              loadNumber: load.loadNumber,
              loadLabel: formatLoadLabel(load.loadNumber, updated.referenceNumber),
              status: updated.status,
              message: `${formatLoadLabel(load.loadNumber, updated.referenceNumber)} promoted to PENDING. Next step: assign-load to set a driver and vehicle.`,
            }),
          },
        ],
      };
    } catch (error) {
      return errorResponse(error instanceof Error ? error.message : 'Failed to promote load.');
    }
  }
}
