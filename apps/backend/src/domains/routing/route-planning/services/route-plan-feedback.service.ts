import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

interface SubmitFeedbackParams {
  planId: string;
  segmentId: string;
  rating: 'good' | 'bad';
  reason?: string;
  userId: number;
  tenantId: number;
}

@Injectable()
export class RoutePlanFeedbackService {
  private readonly logger = new Logger(RoutePlanFeedbackService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Submit feedback (thumbs up/down) for a specific route segment.
   */
  async submitFeedback(params: SubmitFeedbackParams) {
    const { planId, segmentId, rating, reason, userId, tenantId } = params;

    // Validate that the plan and segment exist and belong to the tenant
    const plan = await this.prisma.routePlan.findFirst({
      where: { planId, tenantId },
      select: { id: true },
    });

    if (!plan) {
      throw new NotFoundException(`Route plan not found: ${planId}`);
    }

    // Plan-level feedback uses a synthetic segmentId (plan-overall-{planId})
    // and skips segment validation
    const isPlanLevel = segmentId.startsWith('plan-overall-');

    if (!isPlanLevel) {
      const segment = await this.prisma.routeSegment.findFirst({
        where: { segmentId, planId: plan.id },
        select: { id: true },
      });

      if (!segment) {
        throw new NotFoundException(`Segment not found: ${segmentId} in plan ${planId}`);
      }
    }

    // Upsert: one feedback per user per segment (changing mind overwrites, not duplicates)
    const existing = await this.prisma.routePlanFeedback.findFirst({
      where: { planId, segmentId, userId },
    });

    const feedback = existing
      ? await this.prisma.routePlanFeedback.update({
          where: { id: existing.id },
          data: { rating, reason: reason ?? null },
        })
      : await this.prisma.routePlanFeedback.create({
          data: {
            planId,
            segmentId,
            rating,
            reason: reason ?? null,
            userId,
            tenantId,
          },
        });

    this.logger.log(`Feedback submitted: plan=${planId}, segment=${segmentId}, rating=${rating}`);

    return {
      id: feedback.id,
      planId: feedback.planId,
      segmentId: feedback.segmentId,
      rating: feedback.rating,
      reason: feedback.reason,
      createdAt: feedback.createdAt,
    };
  }
}
