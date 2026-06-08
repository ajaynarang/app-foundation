import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { IftaService } from '../../../operations/ifta/services/ifta.service';
import { getQuarterFromDate } from '../../../operations/ifta/ifta.types';
import { RequiresScope } from '../../agent-contract/requires-scope.decorator';

/**
 * IFTA Fuel Tax MCP Tools — query IFTA quarter summaries, state breakdowns, and quarter list.
 *
 * All tools are read-only — no HITL confirmation needed.
 *
 * All queries are tenant-scoped via `_tenantId`, which is injected by
 * McpToolService from the authenticated session — NEVER from AI input.
 * The AI cannot see or override the _tenantId parameter.
 */
@Injectable()
export class IftaTool {
  constructor(private readonly iftaService: IftaService) {}

  @RequiresScope('invoices:read')
  @Tool({
    name: 'get-ifta-summary',
    description:
      'Get IFTA fuel tax summary for the current or a specified quarter. Returns net tax due, total miles, total gallons, fleet avg MPG, filing deadline, days until deadline, and anomaly count. If no year/quarter is provided, defaults to the current quarter.',
    parameters: z.object({
      year: z
        .number()
        .int()
        .min(2000)
        .max(2100)
        .optional()
        .describe('The calendar year (e.g. 2026). Defaults to current year.'),
      quarter: z
        .number()
        .int()
        .min(1)
        .max(4)
        .optional()
        .describe('Quarter number 1–4. Defaults to the current quarter.'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async getIftaSummary({
    year,
    quarter,
    _tenantId,
  }: {
    year?: number;
    quarter?: number;
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

    // Default to current quarter if not provided
    const now = new Date();
    const current = getQuarterFromDate(now);
    const targetYear = year ?? current.year;
    const targetQuarter = quarter ?? current.quarter;

    try {
      const quarters = await this.iftaService.getQuarters(_tenantId, {
        year: targetYear,
      });

      const match = quarters.find((q) => q.quarter === targetQuarter);

      if (!match) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `No IFTA quarter found for Q${targetQuarter} ${targetYear}. The quarter may not have been created yet.`,
                targetYear,
                targetQuarter,
              }),
            },
          ],
        };
      }

      const summary = await this.iftaService.getQuarterSummary(_tenantId, match.id);

      const result = {
        quarterId: match.id,
        year: summary.year,
        quarter: summary.quarter,
        status: summary.status,
        totalMiles: summary.totalMiles,
        totalGallons: summary.totalGallons,
        fleetAvgMpg: summary.fleetAvgMpg,
        totalTaxOwedCents: summary.totalTaxOwedCents,
        totalTaxPaidCents: summary.totalTaxPaidCents,
        netTaxDueCents: summary.netTaxDueCents,
        netTaxDueDollars: (summary.netTaxDueCents / 100).toFixed(2),
        anomalyCount: summary.anomalyCount,
        filingDeadline: summary.filingDeadline.toISOString(),
        daysUntilDeadline: summary.daysUntilDeadline,
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result),
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
    name: 'get-ifta-state-breakdown',
    description:
      'Get the per-state tax breakdown for a specific IFTA quarter. Returns an array of state entries with miles driven, taxable gallons, fuel purchased, tax owed, tax paid, and net tax for each jurisdiction. Use get-ifta-summary or query-ifta-quarters first to get a quarterId.',
    parameters: z.object({
      quarterId: z.number().int().describe('The IFTA quarter ID to get the state breakdown for'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async getIftaStateBreakdown({ quarterId, _tenantId }: { quarterId: number; _tenantId?: number; _userId?: string }) {
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
      const detail = await this.iftaService.getQuarterDetail(_tenantId, quarterId);

      const states = detail.stateMileage.map((s: any) => ({
        jurisdiction: s.jurisdiction,
        totalMiles: s.totalMiles,
        taxableGallons: s.taxableGallons ?? 0,
        taxRatePerGallon: s.taxRatePerGallon ?? 0,
        surchargeRate: s.surchargeRate ?? 0,
        taxOwedCents: s.taxOwedCents ?? 0,
        surchargeOwedCents: s.surchargeOwedCents ?? 0,
        taxPaidCents: 0, // derived from fuel purchases — not stored per-state on mileage record
        netTaxCents: (s.taxOwedCents ?? 0) + (s.surchargeOwedCents ?? 0),
        source: s.source,
      }));

      const result = {
        quarterId,
        year: detail.year,
        quarter: detail.quarter,
        status: detail.status,
        stateCount: states.length,
        states,
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result),
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
    name: 'query-ifta-quarters',
    description:
      'List all IFTA quarters with their status for the tenant. Returns quarter IDs, year, quarter number, status, net tax due, total miles, total gallons, filing deadline, and anomaly count. Optionally filter by year.',
    parameters: z.object({
      year: z
        .number()
        .int()
        .min(2000)
        .max(2100)
        .optional()
        .describe('Filter by calendar year (e.g. 2026). Returns all years if omitted.'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async queryIftaQuarters({ year, _tenantId }: { year?: number; _tenantId?: number; _userId?: string }) {
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
      const quarters = await this.iftaService.getQuarters(_tenantId, {
        year,
      });

      const mapped = quarters.map((q: any) => ({
        quarterId: q.id,
        year: q.year,
        quarter: q.quarter,
        label: `Q${q.quarter} ${q.year}`,
        status: q.status,
        totalMiles: q.totalMiles ?? 0,
        totalGallons: q.totalGallons ?? 0,
        netTaxDueCents: q.netTaxDueCents ?? 0,
        netTaxDueDollars: ((q.netTaxDueCents ?? 0) / 100).toFixed(2),
        anomalyCount: q.anomalyCount ?? 0,
        filedAt: q.filedAt ? (q.filedAt as Date).toISOString() : null,
        confirmedAt: q.confirmedAt ? (q.confirmedAt as Date).toISOString() : null,
        periodStart: (q.periodStart as Date).toISOString(),
        periodEnd: (q.periodEnd as Date).toISOString(),
      }));

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              count: mapped.length,
              quarters: mapped,
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
