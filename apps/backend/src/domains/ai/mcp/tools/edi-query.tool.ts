import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { EDIMessageStatus } from '@prisma/client';
import { formatLoadLabel } from '@app/shared-types';
import { EDIMessageService } from '../../../integrations/edi/services/edi-message.service';
import { EDIPartnerService } from '../../../integrations/edi/services/edi-partner.service';
import { TenderRulesService } from '../../../integrations/edi/tender/tender-rules.service';
import { RequiresScope } from '../../agent-contract/requires-scope.decorator';

/**
 * EDI Query MCP Tools — read-only tools for EDI tender and partner queries.
 *
 * All queries are tenant-scoped via `_tenantId`, which is injected by
 * McpToolService from the authenticated session — NEVER from AI input.
 * The AI cannot see or override the _tenantId parameter.
 */
@Injectable()
export class EDIQueryTool {
  constructor(
    private readonly messageService: EDIMessageService,
    private readonly partnerService: EDIPartnerService,
    private readonly rulesService: TenderRulesService,
  ) {}

  @RequiresScope('integrations:read')
  @Tool({
    name: 'query-tenders',
    description:
      'List pending EDI tenders (204 load offers) awaiting response. Returns tender details with rate analysis, broker info, origin/destination, and expiration. Use this when a dispatcher asks about incoming tenders or pending load offers from brokers.',
    parameters: z.object({
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async queryTenders({ _tenantId }: { _tenantId?: number; _userId?: string }) {
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
      const tenders = await this.messageService.findPendingTenders(_tenantId);

      const mapped = tenders.map((t: any) => {
        const parsed = t.parsedData ?? {};
        const rateCents = parsed.rateCents ?? 0;
        const stops = parsed.stops ?? [];
        const estimatedMiles = stops.length >= 2 ? 300 : 0;
        const ratePerMile = estimatedMiles > 0 ? (rateCents / 100 / estimatedMiles).toFixed(2) : null;

        return {
          messageId: t.id,
          brokerName: parsed.brokerName ?? t.tradingPartner?.name ?? 'Unknown',
          brokerReference: parsed.brokerReference ?? t.referenceNumber,
          rateDollars: rateCents ? (rateCents / 100).toFixed(2) : null,
          ratePerMile,
          equipmentType: parsed.equipmentType ?? null,
          originCity: stops[0]?.city ?? null,
          originState: stops[0]?.state ?? null,
          destinationCity: stops[stops.length - 1]?.city ?? null,
          destinationState: stops[stops.length - 1]?.state ?? null,
          stopCount: stops.length,
          expiresAt: t.expiresAt ?? null,
          receivedAt: t.createdAt,
        };
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              count: mapped.length,
              tenders: mapped,
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
              error: error?.message ?? 'Failed to query tenders',
            }),
          },
        ],
      };
    }
  }

  @RequiresScope('integrations:read')
  @Tool({
    name: 'get-edi-analytics',
    description:
      'Get EDI tender analytics: total tenders received, accepted, declined, auto-accept rate, and broker comparison stats. Use this when a dispatcher asks about EDI performance or broker comparison.',
    parameters: z.object({
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async getEdiAnalytics({ _tenantId }: { _tenantId?: number; _userId?: string }) {
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
      const partners = await this.partnerService.listPartners(_tenantId);

      let totalReceived = 0;
      let totalAccepted = 0;
      let totalDeclined = 0;

      const brokerStats = partners.map((p: any) => {
        totalReceived += p.tendersReceived ?? 0;
        totalAccepted += p.tendersAccepted ?? 0;
        totalDeclined += p.tendersDeclined ?? 0;

        return {
          partnerId: p.id,
          name: p.name,
          tendersReceived: p.tendersReceived ?? 0,
          tendersAccepted: p.tendersAccepted ?? 0,
          tendersDeclined: p.tendersDeclined ?? 0,
          acceptRate: p.tendersReceived > 0 ? ((p.tendersAccepted / p.tendersReceived) * 100).toFixed(1) + '%' : 'N/A',
          lastMessageAt: p.lastMessageAt ?? null,
        };
      });

      const rules = await this.rulesService.listRules(_tenantId);
      const activeRules = rules.filter((r: any) => r.isActive);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              totalTendersReceived: totalReceived,
              totalTendersAccepted: totalAccepted,
              totalTendersDeclined: totalDeclined,
              overallAcceptRate: totalReceived > 0 ? ((totalAccepted / totalReceived) * 100).toFixed(1) + '%' : 'N/A',
              activeAutoAcceptRules: activeRules.length,
              brokerStats,
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
              error: error?.message ?? 'Failed to get analytics',
            }),
          },
        ],
      };
    }
  }

  @RequiresScope('integrations:read')
  @Tool({
    name: 'get-trading-partners',
    description:
      'List all connected EDI trading partners (brokers/shippers) with their message counts and auto-accept rule counts. Use this when a dispatcher asks about EDI connections or which brokers are set up.',
    parameters: z.object({
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async getTradingPartners({ _tenantId }: { _tenantId?: number; _userId?: string }) {
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
      const partners = await this.partnerService.listPartners(_tenantId);

      const mapped = partners.map((p: any) => ({
        id: p.id,
        name: p.name,
        isaId: p.isaId,
        gsId: p.gsId,
        vanProvider: p.vanProvider,
        isActive: p.isActive,
        supportedMessages: p.supportedMessages,
        messageCount: p._count?.messages ?? 0,
        autoAcceptRuleCount: p._count?.autoAcceptRules ?? 0,
        tendersReceived: p.tendersReceived ?? 0,
        tendersAccepted: p.tendersAccepted ?? 0,
        tendersDeclined: p.tendersDeclined ?? 0,
        lastMessageAt: p.lastMessageAt ?? null,
      }));

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              count: mapped.length,
              partners: mapped,
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
              error: error?.message ?? 'Failed to list partners',
            }),
          },
        ],
      };
    }
  }

  @RequiresScope('integrations:read')
  @Tool({
    name: 'get-edi-message-log',
    description:
      'Get the audit trail of EDI messages (204 tenders, 210 invoices, 214 status updates). Filter by direction (INBOUND/OUTBOUND), message type, or status. Use this when a dispatcher wants to see EDI message history or troubleshoot EDI communication.',
    parameters: z.object({
      direction: z.string().optional().describe('Filter by direction: INBOUND or OUTBOUND'),
      messageType: z.string().optional().describe('Filter by message type: T204, T210, T214'),
      // Bound to Prisma's EDIMessageStatus enum so the LLM passes an exact
      // value and Prisma never sees a malformed status.
      status: z
        .nativeEnum(EDIMessageStatus)
        .optional()
        .describe(
          `Filter by EDI message status. Valid values (uppercase, exact): ${Object.values(EDIMessageStatus).join(', ')}.`,
        ),
      limit: z.number().min(1).max(100).default(25).describe('Max results to return'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async getEdiMessageLog({
    direction,
    messageType,
    status,
    limit,
    _tenantId,
  }: {
    direction?: string;
    messageType?: string;
    status?: EDIMessageStatus;
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

    try {
      const result = await this.messageService.listMessages(_tenantId, {
        direction,
        messageType,
        status,
        limit,
      });

      const mapped = result.data.map((m: any) => ({
        id: m.id,
        direction: m.direction,
        messageType: m.messageType,
        status: m.status,
        referenceNumber: m.referenceNumber,
        tradingPartnerName: m.tradingPartner?.name ?? 'Unknown',
        loadNumber: m.load?.loadNumber ?? null,
        loadLabel: m.load ? formatLoadLabel(m.load.loadNumber, m.load.referenceNumber) : null,
        createdAt: m.createdAt,
        respondedAt: m.respondedAt ?? null,
        errorMessage: m.errorMessage ?? null,
      }));

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              count: mapped.length,
              total: result.total,
              messages: mapped,
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
              error: error?.message ?? 'Failed to get message log',
            }),
          },
        ],
      };
    }
  }
}
