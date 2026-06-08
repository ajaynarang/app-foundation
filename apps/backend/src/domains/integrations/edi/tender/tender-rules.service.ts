import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

interface AutoAcceptConditions {
  minRatePerMile?: number;
  maxDistance?: number;
  equipmentTypes?: string[];
  originRadius?: { lat: number; lng: number; radiusMiles: number };
  destinationRadius?: { lat: number; lng: number; radiusMiles: number };
  lanes?: Array<{ originState: string; destinationState: string }>;
  excludeHazmat?: boolean;
}

export interface TenderForEvaluation {
  rateCents: number;
  totalMiles: number;
  equipmentType?: string;
  tradingPartnerId: number;
  originState?: string;
  destinationState?: string;
  hazmat?: boolean;
}

@Injectable()
export class TenderRulesService {
  private readonly logger = new Logger(TenderRulesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async evaluateRules(tenantId: number, tender: TenderForEvaluation) {
    const rules = await this.prisma.eDIAutoAcceptRule.findMany({
      where: {
        tenantId,
        isActive: true,
        OR: [{ tradingPartnerId: null }, { tradingPartnerId: tender.tradingPartnerId }],
      },
      orderBy: { priority: 'desc' },
    });

    for (const rule of rules) {
      if (rule.createdBy === 'sally_suggested' && !rule.approvedAt) continue;
      if (this.matchesConditions(tender, rule.conditions as AutoAcceptConditions)) {
        return rule;
      }
    }

    return null;
  }

  private matchesConditions(tender: TenderForEvaluation, conditions: AutoAcceptConditions): boolean {
    const ratePerMile = tender.totalMiles > 0 ? tender.rateCents / 100 / tender.totalMiles : 0;

    if (conditions.minRatePerMile != null && ratePerMile < conditions.minRatePerMile) return false;
    if (conditions.maxDistance != null && tender.totalMiles > conditions.maxDistance) return false;
    if (
      conditions.equipmentTypes?.length &&
      tender.equipmentType &&
      !conditions.equipmentTypes.includes(tender.equipmentType)
    )
      return false;
    if (conditions.excludeHazmat && tender.hazmat) return false;

    if (conditions.lanes?.length && tender.originState && tender.destinationState) {
      const laneMatch = conditions.lanes.some(
        (l) => l.originState === tender.originState && l.destinationState === tender.destinationState,
      );
      if (!laneMatch) return false;
    }

    return true;
  }

  async incrementMatchCount(ruleId: number) {
    return this.prisma.eDIAutoAcceptRule.update({
      where: { id: ruleId },
      data: { matchCount: { increment: 1 }, lastMatchAt: new Date() },
    });
  }

  async listRules(tenantId: number) {
    return this.prisma.eDIAutoAcceptRule.findMany({
      where: { tenantId },
      include: { tradingPartner: { select: { name: true } } },
      orderBy: [{ isActive: 'desc' }, { priority: 'desc' }],
    });
  }

  async createRule(
    tenantId: number,
    data: {
      name: string;
      conditions: Record<string, unknown>;
      tradingPartnerId?: number;
      priority?: number;
      createdBy?: string;
      suggestedFromPattern?: Record<string, unknown>;
    },
  ) {
    return this.prisma.eDIAutoAcceptRule.create({
      data: {
        tenantId,
        name: data.name,
        conditions: data.conditions as Prisma.InputJsonValue,
        tradingPartnerId: data.tradingPartnerId,
        priority: data.priority ?? 0,
        createdBy: data.createdBy ?? 'user',
        suggestedFromPattern: (data.suggestedFromPattern as Prisma.InputJsonValue) ?? Prisma.DbNull,
        approvedAt: data.createdBy === 'sally_suggested' ? null : new Date(),
      },
    });
  }

  async approveRule(tenantId: number, ruleId: number, userId: number) {
    const rule = await this.prisma.eDIAutoAcceptRule.findFirst({
      where: { id: ruleId, tenantId },
    });
    if (!rule) {
      throw new NotFoundException(`Auto-accept rule ${ruleId} not found`);
    }
    return this.prisma.eDIAutoAcceptRule.update({
      where: { id: ruleId },
      data: { approvedAt: new Date(), approvedByUserId: userId },
    });
  }

  async updateRule(
    tenantId: number,
    ruleId: number,
    data: {
      name?: string;
      conditions?: Record<string, unknown>;
      priority?: number;
      isActive?: boolean;
    },
  ) {
    const rule = await this.prisma.eDIAutoAcceptRule.findFirst({
      where: { id: ruleId, tenantId },
    });
    if (!rule) {
      throw new NotFoundException(`Auto-accept rule ${ruleId} not found`);
    }
    return this.prisma.eDIAutoAcceptRule.update({
      where: { id: ruleId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.conditions !== undefined && {
          conditions: data.conditions as Prisma.InputJsonValue,
        }),
        ...(data.priority !== undefined && { priority: data.priority }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  }
}
