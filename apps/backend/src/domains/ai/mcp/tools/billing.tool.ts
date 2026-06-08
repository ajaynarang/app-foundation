import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { formatLoadLabel } from '@app/shared-types';
import { BillingReadinessService } from '../../../financials/close-out/billing-readiness.service';
import { CloseOutService } from '../../../financials/close-out/close-out.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { RequiresScope } from '../../agent-contract/requires-scope.decorator';

/**
 * Billing MCP Tools — billing readiness, approval, and charge queries.
 *
 * Read operations: get-billing-readiness, get-load-charges (instant, no confirmation)
 * Write operations: approve-for-billing (requires HITL confirmation)
 *
 * All queries are tenant-scoped via `_tenantId`, which is injected by
 * McpToolService from the authenticated session — NEVER from AI input.
 * The AI cannot see or override the _tenantId parameter.
 */
@Injectable()
export class BillingTool {
  constructor(
    private readonly billingReadinessService: BillingReadinessService,
    private readonly closeOutService: CloseOutService,
    private readonly prisma: PrismaService,
  ) {}

  @RequiresScope('invoices:read')
  @Tool({
    name: 'get-billing-readiness',
    description:
      'Check if a load is ready for invoicing. Returns a document compliance score, blocker status, and a list of requirements (documents and charges) with their satisfaction status. Use this to see what is missing before approving a load for billing.',
    parameters: z.object({
      loadId: z.string().describe('Load ID (e.g., ld_abc123). Use get-load-detail to find it by load number first.'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async getBillingReadiness({ loadId, _tenantId }: { loadId: string; _tenantId?: number; _userId?: string }) {
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
      // Fetch reference number for dispatcher context
      const load = await this.prisma.load.findFirst({
        where: { loadNumber: loadId, tenantId: _tenantId },
        select: { loadNumber: true, referenceNumber: true },
      });

      const result = await this.billingReadinessService.evaluate(loadId, _tenantId);

      const cardData = {
        complianceScore: result.score,
        hasBlockers: result.hasBlockers,
        requirements: result.items.map((item) => ({
          documentType: item.type,
          status: item.status,
          reason: item.reason,
          dueBy: item.dueBy,
        })),
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              loadId,
              loadNumber: load?.loadNumber ?? null,
              loadLabel: load ? formatLoadLabel(load.loadNumber, load.referenceNumber) : null,
              referenceNumber: load?.referenceNumber ?? null,
              score: result.score,
              totalRequired: result.totalRequired,
              totalSatisfied: result.totalSatisfied,
              readyToApprove: result.readyToApprove,
              hasBlockers: result.hasBlockers,
              overrideAllowed: result.overrideAllowed,
              overrideExists: result.overrideExists ?? null,
              items: result.items.map((item) => ({
                category: item.category,
                type: item.type,
                label: item.label,
                enforcement: item.enforcement,
                status: item.status,
                reason: item.reason,
                dueBy: item.dueBy ?? null,
                amountCents: item.amountCents ?? null,
              })),
            }),
          },
        ],
        _card: { type: 'doc_compliance' as const, data: cardData },
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

  @RequiresScope('invoices:write')
  @Tool({
    name: 'approve-for-billing',
    description:
      'Approve a delivered load for billing. This validates document compliance and transitions the load to APPROVED status, allowing invoice generation. If documents are missing and overrides are enabled, an override reason is required. IMPORTANT: Always confirm with the dispatcher before calling this tool. Tell them which load you are about to approve and ask for explicit confirmation.',
    parameters: z.object({
      loadId: z.string().describe('Load ID (e.g., ld_abc123). Use get-load-detail to find it by load number first.'),
      overrideReason: z
        .string()
        .optional()
        .describe(
          'Reason for overriding missing documents. Required only if the load is not fully compliant and overrides are allowed.',
        ),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async approveForBilling({
    loadId,
    overrideReason,
    _tenantId,
    _userId,
  }: {
    loadId: string;
    overrideReason?: string;
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
      const result = await this.closeOutService.approveForBilling(
        _tenantId,
        loadId,
        _userId ? parseInt(_userId, 10) : undefined,
        overrideReason,
      );

      const load = await this.prisma.load.findFirst({
        where: { loadNumber: loadId, tenantId: _tenantId },
        select: { loadNumber: true, referenceNumber: true },
      });
      const loadLabel = load ? formatLoadLabel(load.loadNumber, load.referenceNumber) : `Load ${loadId}`;

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              loadNumber: result.loadNumber,
              loadLabel,
              billingStatus: result.billingStatus,
              message: `${loadLabel} has been approved for billing`,
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

  @RequiresScope('invoices:read')
  @Tool({
    name: 'get-load-charges',
    description:
      'View all charges on a load. Returns the list of line-item charges including type, description, quantity, unit price, total, and billable/payable flags. Useful for reviewing charges before approving or invoicing a load.',
    parameters: z.object({
      loadId: z.string().describe('The load ID to view charges for (e.g. ld_abc123)'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async getLoadCharges({ loadId, _tenantId }: { loadId: string; _tenantId?: number; _userId?: string }) {
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

    const load = await this.prisma.load.findFirst({
      where: { loadNumber: loadId, tenantId: _tenantId },
      include: { charges: true },
    });

    if (!load) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: `Load ${loadId} not found` }),
          },
        ],
      };
    }

    const charges = (load.charges ?? []).map((c) => ({
      chargeType: c.chargeType,
      description: c.description,
      quantity: c.quantity,
      unitPriceDollars: (c.unitPriceCents / 100).toFixed(2),
      totalDollars: (c.totalCents / 100).toFixed(2),
      isBillable: c.isBillable,
      isPayable: c.isPayable,
    }));

    const totalBillableCents = (load.charges ?? [])
      .filter((c) => c.isBillable)
      .reduce((sum, c) => sum + c.totalCents, 0);

    const totalPayableCents = (load.charges ?? []).filter((c) => c.isPayable).reduce((sum, c) => sum + c.totalCents, 0);

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            loadId,
            loadNumber: load.loadNumber,
            loadLabel: formatLoadLabel(load.loadNumber, load.referenceNumber),
            referenceNumber: load.referenceNumber ?? null,
            chargeCount: charges.length,
            totalBillableDollars: (totalBillableCents / 100).toFixed(2),
            totalPayableDollars: (totalPayableCents / 100).toFixed(2),
            charges,
          }),
        },
      ],
    };
  }
}
