import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { SettlementStatus } from '@prisma/client';
import { formatLoadLabel } from '@app/shared-types';
import { SettlementsService } from '../../../financials/settlements/services/settlements.service';
import { PayStructureService } from '../../../financials/settlements/services/pay-structure.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { RequiresScope } from '../../agent-contract/requires-scope.decorator';

/**
 * Settlement MCP Tools — read-only tools for dispatcher settlement queries.
 *
 * All queries are tenant-scoped via `_tenantId`, which is injected by
 * McpToolService from the authenticated session — NEVER from AI input.
 * The AI cannot see or override the _tenantId parameter.
 */
@Injectable()
export class SettlementTool {
  constructor(
    private readonly settlementsService: SettlementsService,
    private readonly payStructureService: PayStructureService,
    private readonly prisma: PrismaService,
  ) {}

  @RequiresScope('settlements:read')
  @Tool({
    name: 'query-settlements',
    description:
      'Search settlements for the current tenant. Filter by status (DRAFT, APPROVED, PAID, VOID) or driver name. Returns up to 20 settlements with driver, period, gross/net pay, and deductions. Do NOT use for a single settlement breakdown — use get-settlement-detail.',
    parameters: z.object({
      // Bound to Prisma's SettlementStatus enum so the LLM must pass an
      // exact value and Prisma never sees a malformed status. Description
      // lists the valid values explicitly.
      status: z
        .nativeEnum(SettlementStatus)
        .optional()
        .describe(
          `Filter by settlement status. Valid values (uppercase, exact): ${Object.values(SettlementStatus).join(', ')}.`,
        ),
      driverName: z.string().optional().describe('Filter by driver name (partial match)'),
      limit: z.number().min(1).max(50).default(20).describe('Max results to return'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async querySettlements({
    status,
    driverName,
    limit,
    _tenantId,
  }: {
    status?: SettlementStatus;
    driverName?: string;
    limit: number;
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

    // If filtering by driver name, resolve to driverId first
    let driverId: string | undefined;
    if (driverName) {
      const driver = await this.prisma.driver.findFirst({
        where: {
          tenantId: _tenantId,
          name: { contains: driverName, mode: 'insensitive' as const },
        },
        select: { driverId: true },
      });
      if (!driver) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `No driver found matching "${driverName}"`,
              }),
            },
          ],
        };
      }
      driverId = driver.driverId;
    }

    const settlements = await this.settlementsService.findAll(_tenantId, { status, driverId }, { limit, offset: 0 });

    const mapped = (settlements as any[]).map((s) => ({
      id: s.settlementId,
      number: s.settlementNumber,
      status: s.status,
      driverName: s.driver?.name ?? 'Unknown',
      periodStart: s.periodStart ?? null,
      periodEnd: s.periodEnd ?? null,
      grossPayCents: s.grossPayCents,
      deductionsCents: s.deductionsCents,
      netPayCents: s.netPayCents,
      lineItemCount: s.lineItems?.length ?? 0,
    }));

    const cardData = {
      settlements: mapped,
      totalCount: mapped.length,
    };

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            count: mapped.length,
            settlements: mapped.map((s) => ({
              ...s,
              grossPayDollars: s.grossPayCents != null ? (s.grossPayCents / 100).toFixed(2) : null,
              deductionsDollars: s.deductionsCents != null ? (s.deductionsCents / 100).toFixed(2) : null,
              netPayDollars: s.netPayCents != null ? (s.netPayCents / 100).toFixed(2) : null,
            })),
          }),
        },
      ],
      _card: { type: 'settlement_list' as const, data: cardData },
    };
  }

  @RequiresScope('settlements:read')
  @Tool({
    name: 'get-settlement-detail',
    description:
      'Get full details for a single settlement by its ID (e.g. stl_abc123). Returns driver info, period, line items with load references, deductions, and gross/net pay breakdown.',
    parameters: z.object({
      settlementId: z.string().describe('The settlement ID (e.g. stl_abc123)'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async getSettlementDetail({
    settlementId,
    _tenantId,
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
      const settlement = (await this.settlementsService.findOne(_tenantId, settlementId)) as any;

      const settlementData = {
        id: settlement.settlementId,
        number: settlement.settlementNumber,
        status: settlement.status,
        driverName: settlement.driver?.name ?? 'Unknown',
        periodStart: settlement.periodStart ?? null,
        periodEnd: settlement.periodEnd ?? null,
        grossPayCents: settlement.grossPayCents,
        deductionsCents: settlement.deductionsCents,
        netPayCents: settlement.netPayCents,
        lineItemCount: settlement.lineItems?.length ?? 0,
      };

      const fullDetail = {
        ...settlementData,
        grossPayDollars: (settlement.grossPayCents / 100).toFixed(2),
        deductionsDollars: (settlement.deductionsCents / 100).toFixed(2),
        netPayDollars: (settlement.netPayCents / 100).toFixed(2),
        driverId: settlement.driver?.driverId ?? null,
        lineItems: settlement.lineItems?.map((li: any) => ({
          description: li.description,
          miles: li.miles,
          loadRevenueDollars: li.loadRevenueCents != null ? (li.loadRevenueCents / 100).toFixed(2) : null,
          payAmountDollars: (li.payAmountCents / 100).toFixed(2),
          payStructureType: li.payStructureType,
          loadNumber: li.load?.loadNumber ?? null,
          loadLabel: li.load ? formatLoadLabel(li.load.loadNumber, li.load.referenceNumber) : null,
          ...(li.leg && {
            legId: li.leg.legId,
            legSequence: li.leg.sequence,
          }),
        })),
        deductions: settlement.deductions?.map((d: any) => ({
          id: d.id,
          type: d.type,
          description: d.description,
          amountDollars: (d.amountCents / 100).toFixed(2),
        })),
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(fullDetail),
          },
        ],
        _card: { type: 'settlement' as const, data: settlementData },
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: error?.message ?? `Settlement ${settlementId} not found`,
            }),
          },
        ],
      };
    }
  }

  @RequiresScope('settlements:read')
  @Tool({
    name: 'get-settlement-summary',
    description:
      'Get a settlement summary for the current tenant: count of drafts pending approval, count approved and ready to pay, total paid this month, and number of active drivers with pay structures.',
    parameters: z.object({
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async getSettlementSummary({ _tenantId }: { _tenantId?: number; _userId?: string }) {
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

    const summary = await this.settlementsService.getSummary(_tenantId);

    const cardData = {
      pendingTotalCents: 0, // Summary counts only; no aggregate cent values available
      approvedTotalCents: 0,
      paidTotalCents: summary.paidThisMonthCents,
      countByStatus: {
        DRAFT: summary.pendingApproval,
        APPROVED: summary.readyToPay,
        PAID: 0, // paid count not returned by getSummary
      },
    };

    const textData = {
      pendingApprovalCount: summary.pendingApproval,
      readyToPayCount: summary.readyToPay,
      paidThisMonthDollars: (summary.paidThisMonthCents / 100).toFixed(2),
      activeDriverCount: summary.activeDrivers,
    };

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(textData),
        },
      ],
      _card: { type: 'settlement_summary' as const, data: cardData },
    };
  }

  @RequiresScope('settlements:read')
  @Tool({
    name: 'get-driver-pay-structure',
    description:
      'Get the pay structure configuration for a specific driver. Returns pay type (PER_MILE, PERCENTAGE, FLAT_RATE, HYBRID), rates, effective date, and notes. Use this when a dispatcher asks about how a driver is paid.',
    parameters: z.object({
      driverId: z.string().describe('The driver ID (e.g. drv_abc123)'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async getDriverPayStructure({ driverId, _tenantId }: { driverId: string; _tenantId?: number; _userId?: string }) {
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
      const payStructure = await this.payStructureService.getByDriverId(_tenantId, driverId);

      if (!payStructure) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                driverId,
                payStructure: null,
                message: 'No pay structure configured for this driver',
              }),
            },
          ],
        };
      }

      const ps = payStructure as any;
      const textData = {
        driverId,
        type: ps.type,
        ratePerMileDollars: ps.ratePerMileCents != null ? (ps.ratePerMileCents / 100).toFixed(2) : null,
        percentage: ps.percentage != null ? Number(ps.percentage) : null,
        flatRateDollars: ps.flatRateCents != null ? (ps.flatRateCents / 100).toFixed(2) : null,
        hybridBaseDollars: ps.hybridBaseCents != null ? (ps.hybridBaseCents / 100).toFixed(2) : null,
        hybridPercent: ps.hybridPercent != null ? Number(ps.hybridPercent) : null,
        effectiveDate: ps.effectiveDate ?? null,
        notes: ps.notes ?? null,
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(textData),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: error?.message ?? `Driver ${driverId} not found`,
            }),
          },
        ],
      };
    }
  }
}
