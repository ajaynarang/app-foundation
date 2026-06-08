import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { formatLoadLabel } from '@app/shared-types';
import { TenderService } from '../../../integrations/edi/tender/tender.service';
import { TenderRulesService } from '../../../integrations/edi/tender/tender-rules.service';
import { RequiresScope } from '../../agent-contract/requires-scope.decorator';

/**
 * EDI Action MCP Tools — write tools for EDI tender mutations.
 *
 * All mutations are tenant-scoped via `_tenantId`, which is injected by
 * McpToolService from the authenticated session — NEVER from AI input.
 *
 * Write operations require HITL confirmation — the AI must confirm
 * with the user before calling these tools.
 */
@Injectable()
export class EDIActionTool {
  constructor(
    private readonly tenderService: TenderService,
    private readonly rulesService: TenderRulesService,
  ) {}

  @RequiresScope('integrations:write')
  @Tool({
    name: 'respond-to-tender',
    description:
      'Respond to an EDI tender (204 load offer) by accepting, declining, or countering. Sends the response via EDI to the broker. IMPORTANT: Always confirm with the user before calling this tool. Tell them which tender you are responding to, including the broker name, rate, and lane, and ask for explicit confirmation before proceeding.',
    parameters: z.object({
      loadId: z.number().describe('The internal load ID associated with the tender'),
      response: z.enum(['accept', 'decline', 'counter']).describe('The tender response: accept, decline, or counter'),
      counterRateCents: z.number().optional().describe('Counter rate in cents (required when response is "counter")'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async respondToTender({
    loadId,
    response,
    counterRateCents,
    _tenantId,
  }: {
    loadId: number;
    response: 'accept' | 'decline' | 'counter';
    counterRateCents?: number;
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

    if (response === 'counter' && !counterRateCents) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: 'counterRateCents is required when response is "counter"',
            }),
          },
        ],
      };
    }

    try {
      const updatedLoad = await this.tenderService.respondToTender(_tenantId, loadId, response, counterRateCents);

      const responseLabel = {
        accept: 'accepted',
        decline: 'declined',
        counter: 'countered',
      }[response];

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              loadId: (updatedLoad as any).id,
              loadNumber: (updatedLoad as any).loadNumber,
              loadLabel: formatLoadLabel((updatedLoad as any).loadNumber, (updatedLoad as any).referenceNumber ?? null),
              status: (updatedLoad as any).status,
              tenderResponse: responseLabel,
              ...(counterRateCents ? { counterRateDollars: (counterRateCents / 100).toFixed(2) } : {}),
              message: `Tender ${responseLabel} successfully`,
            }),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: error?.message ?? 'Failed to respond to tender',
            }),
          },
        ],
      };
    }
  }

  @RequiresScope('integrations:write')
  @Tool({
    name: 'manage-auto-accept-rules',
    description:
      'List or create auto-accept rules for EDI tenders. Auto-accept rules automatically accept tenders matching certain conditions (min rate per mile, equipment type, lanes, etc.). When action is "create", IMPORTANT: Always confirm with the user before calling. Tell them the rule name, conditions, and ask for explicit confirmation.',
    parameters: z.object({
      action: z.enum(['list', 'create']).describe('Action: "list" to view rules, "create" to add a new rule'),
      name: z.string().optional().describe('Rule name (required for create)'),
      conditions: z
        .object({
          minRatePerMile: z.number().optional().describe('Minimum rate per mile in dollars'),
          maxDistance: z.number().optional().describe('Maximum distance in miles'),
          equipmentTypes: z
            .array(z.string())
            .optional()
            .describe('Allowed equipment types (e.g. ["dry_van", "reefer"])'),
          excludeHazmat: z.boolean().optional().describe('Exclude hazmat loads'),
          lanes: z
            .array(
              z.object({
                originState: z.string(),
                destinationState: z.string(),
              }),
            )
            .optional()
            .describe('Allowed lanes by origin/destination state'),
        })
        .optional()
        .describe('Auto-accept conditions (required for create)'),
      tradingPartnerId: z.number().optional().describe('Restrict rule to a specific trading partner'),
      priority: z.number().optional().describe('Rule priority (higher = evaluated first)'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async manageAutoAcceptRules({
    action,
    name,
    conditions,
    tradingPartnerId,
    priority,
    _tenantId,
  }: {
    action: 'list' | 'create';
    name?: string;
    conditions?: Record<string, unknown>;
    tradingPartnerId?: number;
    priority?: number;
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
      if (action === 'list') {
        const rules = await this.rulesService.listRules(_tenantId);

        const mapped = rules.map((r: any) => ({
          id: r.id,
          name: r.name,
          isActive: r.isActive,
          conditions: r.conditions,
          tradingPartnerName: r.tradingPartner?.name ?? null,
          priority: r.priority,
          matchCount: r.matchCount ?? 0,
          lastMatchAt: r.lastMatchAt ?? null,
          createdBy: r.createdBy,
          approvedAt: r.approvedAt ?? null,
        }));

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                count: mapped.length,
                rules: mapped,
              }),
            },
          ],
        };
      }

      // action === 'create'
      if (!name || !conditions) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'name and conditions are required to create a rule',
              }),
            },
          ],
        };
      }

      const rule = await this.rulesService.createRule(_tenantId, {
        name,
        conditions,
        tradingPartnerId,
        priority,
        createdBy: 'user',
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              ruleId: (rule as any).id,
              name: (rule as any).name,
              isActive: (rule as any).isActive,
              message: `Auto-accept rule "${name}" created successfully`,
            }),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: error?.message ?? 'Failed to manage rules',
            }),
          },
        ],
      };
    }
  }
}
