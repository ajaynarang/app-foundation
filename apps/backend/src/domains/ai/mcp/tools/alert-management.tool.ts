import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { AlertPriority, AlertStatus } from '@prisma/client';
import { AlertStatusSchema } from '@sally/shared-types';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { RequiresScope } from '../../agent-contract/requires-scope.decorator';

const ALERT_STATUS = AlertStatusSchema.enum;

/** LLM-friendly lowercase keys → AlertPriority enum (DB requires UPPER). */
const MCP_PRIORITY_MAP: Record<string, AlertPriority> = {
  critical: AlertPriority.CRITICAL,
  high: AlertPriority.HIGH,
  medium: AlertPriority.MEDIUM,
  low: AlertPriority.LOW,
};

/**
 * Alert Management MCP Tools — query and manage alerts for dispatchers.
 *
 * Read operations: get-alerts (instant, no confirmation)
 * Write operations: acknowledge-alert, resolve-alert (require confirmation)
 *
 * Write tools have description instructions telling the AI to confirm
 * with the dispatcher before calling. This is the Phase 3 confirmation
 * pattern — HITL suspend/resume is wired in Task 6.
 */
@Injectable()
export class AlertManagementTool {
  constructor(private readonly prisma: PrismaService) {}

  @RequiresScope('alerts:read')
  @Tool({
    name: 'get-alerts',
    description:
      'Query active alerts for the current tenant. Filter by status, priority, alert type, or driver. Returns up to 20 alerts sorted by priority then recency.',
    parameters: z.object({
      status: AlertStatusSchema.optional().describe(
        'Filter by alert status (UPPER_SNAKE). Defaults to ACTIVE if not specified.',
      ),
      priority: z.enum(['critical', 'high', 'medium', 'low']).optional().describe('Filter by priority level'),
      driverName: z.string().optional().describe('Filter by driver name (partial match)'),
      category: z.string().optional().describe('Filter by alert category'),
      limit: z.number().min(1).max(50).default(20).describe('Max results'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
    }),
  })
  async getAlerts({
    status,
    priority,
    driverName,
    category,
    limit,
    _tenantId,
  }: {
    status?: string;
    priority?: string;
    driverName?: string;
    category?: string;
    limit: number;
    _tenantId?: number;
  }) {
    // Phase 2 Task 10 — alert.driverId is the Int FK. Resolve the
    // name-contains filter to Int FK ids; include the driver relation on
    // the alerts read so we don't need a second lookup for display labels.
    let driverDbIds: number[] | undefined;
    if (driverName) {
      const drivers = await this.prisma.driver.findMany({
        where: {
          ...(_tenantId && { tenantId: _tenantId }),
          name: { contains: driverName, mode: 'insensitive' as const },
        },
        select: { id: true },
      });
      // No matching driver: return empty result early instead of querying
      // alerts with an unbounded filter.
      if (drivers.length === 0) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ count: 0, alerts: [] }) }],
          _card: { type: 'alert_list', data: { alerts: [] } },
        };
      }
      driverDbIds = drivers.map((d) => d.id);
    }

    const mappedPriority = priority ? MCP_PRIORITY_MAP[priority] : undefined;
    const alerts = await this.prisma.alert.findMany({
      where: {
        ...(_tenantId && { tenantId: _tenantId }),
        status: (status ?? ALERT_STATUS.ACTIVE) as AlertStatus,
        ...(mappedPriority && { priority: mappedPriority }),
        ...(category && { category }),
        ...(driverDbIds && { driverId: { in: driverDbIds } }),
      },
      include: {
        notes: { orderBy: { createdAt: 'desc' }, take: 1 },
        driver: { select: { driverId: true, name: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
      take: limit,
    });

    const alertData = alerts.map((a) => ({
      alertId: a.alertId,
      type: a.alertType,
      category: a.category,
      priority: a.priority,
      status: a.status,
      title: a.title,
      message: a.message,
      recommendedAction: a.recommendedAction,
      // Public business identifier (Driver.driverId slug) for the LLM —
      // fall back to the driver's name, then to a placeholder when the
      // alert is system-emitted with no linked driver.
      driver: a.driver?.name ?? a.driver?.driverId ?? 'system',
      createdAt: a.createdAt.toISOString(),
      latestNote: a.notes[0]?.content ?? null,
    }));

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({ count: alerts.length, alerts: alertData }),
        },
      ],
      _card: { type: 'alert_list', data: { alerts: alertData } },
    };
  }

  @RequiresScope('alerts:write')
  @Tool({
    name: 'acknowledge-alert',
    description:
      'Acknowledge an alert. IMPORTANT: Always confirm with the dispatcher before calling this tool. Tell them which alert you are about to acknowledge and ask for explicit confirmation.',
    parameters: z.object({
      alertId: z.string().describe('The alert ID to acknowledge'),
      note: z.string().optional().describe('Optional note to add when acknowledging'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async acknowledgeAlert({
    alertId,
    note,
    _tenantId,
    _userId,
  }: {
    alertId: string;
    note?: string;
    _tenantId?: number;
    _userId?: string;
  }) {
    const alert = await this.prisma.alert.findFirst({
      where: { alertId, ...(_tenantId && { tenantId: _tenantId }) },
    });

    if (!alert) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: `Alert ${alertId} not found` }),
          },
        ],
      };
    }

    if (alert.status !== ALERT_STATUS.ACTIVE) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: `Alert ${alertId} is already ${alert.status}`,
            }),
          },
        ],
      };
    }

    await this.prisma.alert.update({
      where: { id: alert.id },
      data: {
        status: ALERT_STATUS.ACKNOWLEDGED,
        acknowledgedAt: new Date(),
        acknowledgedBy: _userId ?? 'AI-assisted',
      },
    });

    if (note) {
      await this.prisma.alertNote.create({
        data: {
          alertId: alert.id,
          authorId: _userId ?? 'AI-assisted',
          authorName: 'SALLY AI',
          content: note,
        },
      });
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            alertId,
            newStatus: ALERT_STATUS.ACKNOWLEDGED,
            message: `Alert ${alertId} has been acknowledged`,
          }),
        },
      ],
    };
  }

  @RequiresScope('alerts:write')
  @Tool({
    name: 'resolve-alert',
    description:
      'Resolve an alert with a resolution note. IMPORTANT: Always confirm with the dispatcher before calling this tool. Tell them which alert you are about to resolve and ask for explicit confirmation.',
    parameters: z.object({
      alertId: z.string().describe('The alert ID to resolve'),
      resolutionNote: z.string().describe('Resolution note explaining how the alert was addressed'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async resolveAlert({
    alertId,
    resolutionNote,
    _tenantId,
    _userId,
  }: {
    alertId: string;
    resolutionNote: string;
    _tenantId?: number;
    _userId?: string;
  }) {
    const alert = await this.prisma.alert.findFirst({
      where: { alertId, ...(_tenantId && { tenantId: _tenantId }) },
    });

    if (!alert) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: `Alert ${alertId} not found` }),
          },
        ],
      };
    }

    if (alert.status === ALERT_STATUS.RESOLVED || alert.autoResolved) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: `Alert ${alertId} is already resolved`,
            }),
          },
        ],
      };
    }

    await this.prisma.alert.update({
      where: { id: alert.id },
      data: {
        status: ALERT_STATUS.RESOLVED,
        resolvedAt: new Date(),
        resolvedBy: _userId ?? 'AI-assisted',
        resolutionNotes: resolutionNote,
      },
    });

    // Also create an AlertNote entry for the resolution (audit trail)
    await this.prisma.alertNote.create({
      data: {
        alertId: alert.id,
        authorId: _userId ?? 'AI-assisted',
        authorName: 'SALLY AI',
        content: `Resolved: ${resolutionNote}`,
      },
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            alertId,
            newStatus: ALERT_STATUS.RESOLVED,
            message: `Alert ${alertId} has been resolved`,
          }),
        },
      ],
    };
  }
}
