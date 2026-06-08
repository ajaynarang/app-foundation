import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { AlertPriority, AlertScope } from '@prisma/client';
import { AlertStatusSchema, formatLoadLabel } from '@sally/shared-types';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { errorResponse } from '../utils/entity-resolver';
import { RequiresScope } from '../../../agent-contract/requires-scope.decorator';

const ALERT_STATUS = AlertStatusSchema.enum;

/**
 * Alert Create MCP Tools — driver-persona tool for reporting issues.
 *
 * Identity is resolved from `_userId` (JWT) -> User.driverId.
 * Auto-attaches the driver's current load and vehicle to the alert.
 */
@Injectable()
export class AlertCreateTool {
  constructor(private readonly prisma: PrismaService) {}

  @RequiresScope('alerts:write')
  @Tool({
    name: 'report-issue',
    description:
      'Report an issue and create an alert. Sally infers the category (mechanical, delay, safety, administrative) and priority (critical, high, medium, low) from natural language. Auto-attaches your current load and vehicle. Use when driver says "flat tire", "shipper not ready", or "cargo damaged." Requires user confirmation before executing.',
    parameters: z.object({
      description: z.string().max(1000).describe('Natural language issue description'),
      inferredCategory: z
        .enum(['mechanical', 'delay', 'safety', 'administrative'])
        .describe('AI-inferred category based on the issue description'),
      inferredPriority: z
        .enum(['critical', 'high', 'medium', 'low'])
        .describe('AI-inferred priority based on severity'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async reportIssue({
    description,
    inferredCategory,
    inferredPriority,
    _tenantId,
    _userId,
  }: {
    description: string;
    inferredCategory: 'mechanical' | 'delay' | 'safety' | 'administrative';
    inferredPriority: 'critical' | 'high' | 'medium' | 'low';
    _tenantId?: number;
    _userId?: string;
  }) {
    if (!_userId) {
      return errorResponse('No authenticated session found. Please log in and try again.');
    }
    if (!_tenantId) return errorResponse('Session error: no tenant context.');

    // Step 1: Resolve userId to user and driver
    const user = await this.prisma.user.findFirst({
      where: { userId: _userId },
      select: { driverId: true, id: true },
    });

    if (!user || !user.driverId) {
      return errorResponse('Your account is not linked to a driver profile. Contact your dispatcher.');
    }

    // Step 2: Get driver record for driverId string and assignedVehicleId
    const driver = await this.prisma.driver.findUnique({
      where: { id: user.driverId },
      select: {
        driverId: true,
        name: true,
        assignedVehicleId: true,
      },
    });

    if (!driver) {
      return errorResponse('Driver profile not found.');
    }

    // Step 3: Get vehicle info if assigned. driver.assignedVehicleId is
    // already the Int FK we need; the lookup is only for display labels.
    const vehicleDbId: number | null = driver.assignedVehicleId ?? null;

    // Step 4: Find current load. Phase 2 Task 10: alert.loadId is now the
    // Int FK; loadNumber is still selected for the user-facing reply text.
    const currentLoad = await this.prisma.load.findFirst({
      where: {
        driverId: user.driverId,
        status: { in: ['ASSIGNED', 'IN_TRANSIT'] },
        tenantId: _tenantId,
        isActive: true,
      },
      select: { id: true, loadNumber: true, referenceNumber: true },
    });
    const loadDbId: number | null = currentLoad?.id ?? null;

    // Step 5: Map priority (LLM-input lowercase → Prisma AlertPriority enum)
    const priorityMap: Record<string, AlertPriority> = {
      critical: AlertPriority.CRITICAL,
      high: AlertPriority.HIGH,
      medium: AlertPriority.MEDIUM,
      low: AlertPriority.LOW,
    };
    const priority = priorityMap[inferredPriority] ?? AlertPriority.MEDIUM;

    // Step 6: Map category to alertType
    const alertTypeMap: Record<string, string> = {
      mechanical: 'MECHANICAL_ISSUE',
      delay: 'DELAY_REPORT',
      safety: 'SAFETY_CONCERN',
      administrative: 'ADMINISTRATIVE_ISSUE',
    };
    const alertType = alertTypeMap[inferredCategory] || 'GENERAL_ISSUE';

    // Step 7: Create alert
    const alertId = `alt_${randomUUID().slice(0, 12)}`;

    try {
      await this.prisma.alert.create({
        data: {
          alertId,
          tenantId: _tenantId,
          // Int FKs (Phase 2 Task 10). user.driverId is already the FK to
          // Driver.id (User.driverId is Int? @unique on the schema).
          driverId: user.driverId,
          vehicleId: vehicleDbId,
          loadId: loadDbId,
          scope: AlertScope.LOAD,
          alertType,
          category: 'driver_report',
          priority,
          title: `Driver reported ${inferredCategory} issue`,
          message: `${driver.name} reported: ${description}`,
          status: ALERT_STATUS.ACTIVE,
          recommendedAction: this.getRecommendedAction(inferredCategory),
        },
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              alertId,
              message: `Issue reported successfully. Your dispatcher has been notified.`,
              category: inferredCategory,
              priority: inferredPriority,
              ...(currentLoad && {
                loadNumber: currentLoad.loadNumber,
                loadLabel: formatLoadLabel(currentLoad.loadNumber, currentLoad.referenceNumber),
              }),
            }),
          },
        ],
      };
    } catch (error) {
      return errorResponse(`Failed to create alert: ${error.message}`);
    }
  }

  private getRecommendedAction(category: string): string {
    switch (category) {
      case 'mechanical':
        return 'Review vehicle condition and schedule maintenance if needed. Consider dispatching roadside assistance.';
      case 'delay':
        return 'Update ETAs for affected loads and notify the customer. Consider re-routing if delay is significant.';
      case 'safety':
        return 'Prioritize driver safety. Review incident details and take immediate corrective action if needed.';
      case 'administrative':
        return 'Review the reported issue and follow up with the driver for resolution.';
      default:
        return 'Review the reported issue and take appropriate action.';
    }
  }
}
