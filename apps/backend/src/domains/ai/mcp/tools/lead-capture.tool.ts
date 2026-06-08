import { Injectable, Logger } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { LeadStatusSchema } from '@app/shared-types';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { generateId } from '../../../../shared/utils/id-generator';
import { RequiresScope } from '../../agent-contract/requires-scope.decorator';

const LEAD_STATUS = LeadStatusSchema.enum;

@Injectable()
export class LeadCaptureTool {
  private readonly logger = new Logger(LeadCaptureTool.name);

  constructor(private readonly prisma: PrismaService) {}

  @RequiresScope('customers:write')
  @Tool({
    name: 'request-demo',
    description:
      "Capture a prospect's contact information to schedule a product demo. Use this when the prospect expresses interest in seeing SALLY in action, wants a demo, or wants to get started. Collect at minimum their name and email.",
    parameters: z.object({
      name: z.string().min(1).describe("The prospect's full name"),
      email: z.string().email().describe("The prospect's email address"),
      company: z.string().optional().describe("The prospect's company name"),
      fleetSize: z.string().optional().describe('Number of trucks in their fleet (e.g., "50", "100-200")'),
      phone: z.string().optional().describe("The prospect's phone number"),
      message: z.string().optional().describe('Any additional message or specific interests'),
    }),
  })
  async requestDemo(params: {
    name: string;
    email: string;
    company?: string;
    fleetSize?: string;
    phone?: string;
    message?: string;
  }) {
    // Check for existing demo request from same email
    const existing = await this.prisma.lead.findFirst({
      where: { email: params.email, requestType: 'demo' },
    });

    if (existing) {
      return {
        success: true,
        alreadySubmitted: true,
        message: `Thanks, ${params.name}! We already have your demo request on file. Our team will reach out to ${params.email} shortly.`,
      };
    }

    try {
      await this.prisma.lead.create({
        data: {
          leadId: generateId('lead'),
          name: params.name,
          email: params.email,
          company: params.company ?? null,
          fleetSize: params.fleetSize ?? null,
          phone: params.phone ?? null,
          message: params.message ?? null,
          requestType: 'demo',
          source: 'ai_chat',
          status: LEAD_STATUS.NEW,
        },
      });
    } catch (error: any) {
      // Handle unique constraint violation (race condition fallback)
      if (error?.code === 'P2002') {
        return {
          success: true,
          alreadySubmitted: true,
          message: `Thanks, ${params.name}! We already have your demo request on file. Our team will reach out to ${params.email} shortly.`,
        };
      }
      throw error;
    }

    this.logger.log(`New demo request from ${params.email} (${params.company ?? 'no company'})`);

    return {
      success: true,
      alreadySubmitted: false,
      message: `Great, ${params.name}! Your demo request has been submitted. Our team will reach out to ${params.email} within 1 business day to schedule a personalized demo.`,
    };
  }

  @RequiresScope('fleet:read')
  @Tool({
    name: 'get-pricing',
    description:
      "Return SALLY pricing information based on fleet size. Use this when a prospect asks about pricing, costs, or plans. If they haven't mentioned their fleet size, ask them first before calling this tool.",
    parameters: z.object({
      fleetSize: z.number().min(1).describe('Number of trucks in the fleet'),
    }),
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
  })
  async getPricing(params: { fleetSize: number }) {
    // Read pricing from database — PlanConfig + PlanEntitlement are the source of truth
    const configs = await this.prisma.planConfig.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: 'asc' },
    });

    const entitlements = await this.prisma.planEntitlement.findMany({
      where: {
        plan: { in: configs.map((c) => c.plan) },
        enabled: true,
        type: 'software',
      },
      select: { plan: true, displayName: true },
    });

    // Group enabled features by plan
    const featuresByPlan = new Map<string, string[]>();
    for (const e of entitlements) {
      const list = featuresByPlan.get(e.plan) ?? [];
      list.push(e.displayName);
      featuresByPlan.set(e.plan, list);
    }

    const tiers = configs.map((config) => ({
      name: config.displayName,
      plan: config.plan,
      tagline: config.tagline,
      trucks: config.fleetLimit ? `Up to ${config.fleetLimit}` : 'Unlimited',
      pricePerTruck: config.pricePerUnit ? config.pricePerUnit / 100 : null,
      unitLabel: config.unitLabel,
      features: featuresByPlan.get(config.plan) ?? [],
    }));

    // Find the best-fit plan based on fleet size
    let recommendedTier: string;
    let monthlyEstimate: string;

    const fittingPlan = configs.find((c) => c.fleetLimit !== null && params.fleetSize <= c.fleetLimit);

    if (fittingPlan && fittingPlan.pricePerUnit) {
      recommendedTier = fittingPlan.displayName;
      const monthlyTotal = params.fleetSize * (fittingPlan.pricePerUnit / 100);
      monthlyEstimate = `$${monthlyTotal}/month`;
    } else {
      // Fleet size exceeds all defined limits — recommend enterprise
      const enterprise = configs.find((c) => c.fleetLimit === null);
      recommendedTier = enterprise?.displayName ?? 'Enterprise';
      monthlyEstimate = `Custom pricing — contact our team at ${enterprise?.ctaUrl?.replace('mailto:', '') ?? 'sally@appshore.in'}`;
    }

    return {
      fleetSize: params.fleetSize,
      recommendedTier,
      monthlyEstimate,
      tiers,
      notes: ['30-day free trial with all features', 'Annual billing: 2 months free', 'No setup fees'],
    };
  }
}
