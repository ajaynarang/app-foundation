import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { LoadStatus } from '@prisma/client';
import { formatLoadLabel } from '@sally/shared-types';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { DriverToolUtils } from './driver-tool.utils';
import { SettlementsService } from '../../../financials/settlements/services/settlements.service';
import { PayStructureService } from '../../../financials/settlements/services/pay-structure.service';
import { RequiresScope } from '../../agent-contract/requires-scope.decorator';

/**
 * Driver Pay MCP Tools — read-only tools for a driver's own settlement, loads, and pay structure.
 *
 * All queries are driver-scoped: identity is resolved from `_userId` (JWT) -> `User.driverId`.
 * The AI never controls driver identity — it comes from the authenticated session.
 */
@Injectable()
export class DriverPayTool {
  private readonly utils: DriverToolUtils;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settlementsService: SettlementsService,
    private readonly payStructureService: PayStructureService,
  ) {
    this.utils = new DriverToolUtils(prisma);
  }

  /**
   * Resolve the string driverId (e.g. "drv_xxx") from the numeric driver ID.
   * Returns null if driver not found.
   */
  private async resolveDriverStringId(numericDriverId: number): Promise<string | null> {
    const driver = await this.prisma.driver.findUnique({
      where: { id: numericDriverId },
      select: { driverId: true },
    });
    return driver?.driverId ?? null;
  }

  @RequiresScope('settlements:read')
  @Tool({
    name: 'get-my-settlement',
    description:
      'Get your latest settlement: pay period, gross pay, deductions, net pay, and status. No input needed — uses your authenticated session.',
    parameters: z.object({
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async getMySettlement({ _tenantId, _userId }: { _tenantId?: number; _userId?: string }) {
    if (!_userId) return DriverToolUtils.noSessionError();

    const numericDriverId = await this.utils.resolveDriverId(_userId);
    if (!numericDriverId) return DriverToolUtils.noDriverError();

    const driverStringId = await this.resolveDriverStringId(numericDriverId);
    if (!driverStringId) return DriverToolUtils.noDriverError();

    const settlements = await this.settlementsService.findAll(_tenantId, { driverId: driverStringId }, { limit: 1 });

    if (!settlements || settlements.length === 0) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              message: 'No settlements found for your account.',
            }),
          },
        ],
      };
    }

    const s = settlements[0] as any;

    const settlementData = {
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
    };

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            ...settlementData,
            grossPayDollars: s.grossPayCents != null ? (s.grossPayCents / 100).toFixed(2) : null,
            deductionsDollars: s.deductionsCents != null ? (s.deductionsCents / 100).toFixed(2) : null,
            netPayDollars: s.netPayCents != null ? (s.netPayCents / 100).toFixed(2) : null,
          }),
        },
      ],
      _card: { type: 'settlement' as const, data: settlementData },
    };
  }

  @RequiresScope('fleet:read')
  @Tool({
    name: 'get-my-loads',
    description:
      'Get your load history: load numbers, status, customer, stops, and delivery dates. Optionally filter by status.',
    parameters: z.object({
      // Bound to Prisma's LoadStatus so the LLM passes an exact enum value
      // and Prisma never sees a malformed status.
      status: z
        .nativeEnum(LoadStatus)
        .optional()
        .describe(`Filter by load status. Valid values (uppercase, exact): ${Object.values(LoadStatus).join(', ')}.`),
      limit: z.number().min(1).max(50).default(10).describe('Max results to return (default 10)'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async getMyLoads({
    status,
    limit,
    _tenantId,
    _userId,
  }: {
    status?: LoadStatus;
    limit: number;
    _tenantId?: number;
    _userId?: string;
  }) {
    if (!_userId) return DriverToolUtils.noSessionError();

    const numericDriverId = await this.utils.resolveDriverId(_userId);
    if (!numericDriverId) return DriverToolUtils.noDriverError();

    const where: any = {
      ...(_tenantId && { tenantId: _tenantId }),
      driverId: numericDriverId,
    };
    if (status) where.status = status;

    const loads = await this.prisma.load.findMany({
      where,
      include: {
        stops: {
          orderBy: { sequenceOrder: 'asc' },
          include: {
            stop: {
              select: { name: true, city: true, state: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    if (loads.length === 0) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              message: status ? `No loads found with status "${status}".` : 'No loads found for your account.',
              count: 0,
              loads: [],
            }),
          },
        ],
      };
    }

    const mapped = loads.map((load) => ({
      loadNumber: load.loadNumber,
      loadLabel: formatLoadLabel(load.loadNumber, load.referenceNumber),
      referenceNumber: load.referenceNumber ?? null,
      status: load.status,
      customerName: load.customerName,
      rateDollars: load.rateCents != null ? (load.rateCents / 100).toFixed(2) : null,
      deliveredAt: load.deliveredAt?.toISOString() ?? null,
      createdAt: load.createdAt?.toISOString() ?? null,
      stops: load.stops.map((stop) => ({
        sequence: stop.sequenceOrder,
        actionType: stop.actionType,
        location: stop.stop
          ? `${stop.stop.name}${stop.stop.city ? `, ${stop.stop.city}` : ''}${stop.stop.state ? `, ${stop.stop.state}` : ''}`
          : 'Unknown',
        appointmentDate: stop.appointmentDate?.toISOString() ?? null,
        status: stop.status,
      })),
    }));

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            count: mapped.length,
            loads: mapped,
          }),
        },
      ],
    };
  }

  @RequiresScope('settlements:read')
  @Tool({
    name: 'get-my-pay-structure',
    description:
      'Get your pay rate configuration: pay type (per mile, percentage, flat rate, or hybrid), rates, and effective date. No input needed.',
    parameters: z.object({
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async getMyPayStructure({ _tenantId, _userId }: { _tenantId?: number; _userId?: string }) {
    if (!_userId) return DriverToolUtils.noSessionError();

    const numericDriverId = await this.utils.resolveDriverId(_userId);
    if (!numericDriverId) return DriverToolUtils.noDriverError();

    const driverStringId = await this.resolveDriverStringId(numericDriverId);
    if (!driverStringId) return DriverToolUtils.noDriverError();

    try {
      const payStructure = await this.payStructureService.getByDriverId(_tenantId, driverStringId);

      if (!payStructure) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                message: 'No pay structure configured for your account. Contact your dispatcher.',
                payStructure: null,
              }),
            },
          ],
        };
      }

      const ps = payStructure as any;
      const textData = {
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
              error: error?.message ?? 'Unable to retrieve pay structure. Contact your dispatcher.',
            }),
          },
        ],
      };
    }
  }
}
