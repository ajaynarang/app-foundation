import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { AlertStatusSchema, LoadStopStatusSchema, formatLoadLabel } from '@sally/shared-types';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { RequiresScope } from '../../agent-contract/requires-scope.decorator';
import { DRIVER_CONVERSATION_USER_MODE } from '../../../fleet/loads/driver-messages.constants';

const ALERT_STATUS = AlertStatusSchema.enum;
const LOAD_STOP_STATUS = LoadStopStatusSchema.enum;

@Injectable()
export class DriverContextTool {
  constructor(private readonly prisma: PrismaService) {}

  @RequiresScope('fleet:read')
  @Tool({
    name: 'get-driver-active-context',
    description:
      'Get full real-time context for a specific driver (dispatcher view): their active load and stops, recent ops messages, active alerts, and HOS data. Use when the dispatcher asks "what\'s [driver] up to?" or before answering questions about a driver\'s current status. Do NOT use to list all drivers — use query-drivers. Do NOT use for the driver checking their own data — use get-my-route or get-my-hos.',
    parameters: z.object({
      driverId: z.number().describe('The driver database ID'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
    }),
  })
  async getDriverActiveContext({ driverId, _tenantId }: { driverId: number; _tenantId?: number }) {
    if (!_tenantId) return { error: 'Missing tenant context' };

    // Active load
    const activeLoad = await this.prisma.load.findFirst({
      where: {
        tenantId: _tenantId,
        driverId,
        status: { in: ['ASSIGNED', 'IN_TRANSIT'] },
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        loadNumber: true,
        referenceNumber: true,
        status: true,
        customerName: true,
        stops: {
          orderBy: { sequenceOrder: 'asc' },
          select: {
            status: true,
            actionType: true,
            appointmentDate: true,
            sequenceOrder: true,
            stop: { select: { name: true, city: true, state: true } },
          },
        },
      },
    });

    // Recent operations messages — driver-keyed: the driver's conversation,
    // narrowed to the active load's tagged messages.
    let recentMessages: { role: string; content: string; createdAt: string }[] = [];
    if (activeLoad) {
      const messages = await this.prisma.conversationMessage.findMany({
        where: {
          conversation: { tenantId: _tenantId, driverId, userMode: DRIVER_CONVERSATION_USER_MODE },
          load: { loadNumber: activeLoad.loadNumber },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { role: true, content: true, createdAt: true },
      });
      recentMessages = messages.map((m) => ({
        role: m.role,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      }));
    }

    // Active alerts — Phase 2 Task 10: alert.driverId is now the Int FK to
    // drivers.id, the same value already in scope here.
    const alerts = await this.prisma.alert.findMany({
      where: { tenantId: _tenantId, driverId, status: ALERT_STATUS.ACTIVE },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        alertId: true,
        title: true,
        priority: true,
        category: true,
        recommendedAction: true,
      },
    });

    // HOS data from driver record
    const driver = await this.prisma.driver.findFirst({
      where: { id: driverId, tenantId: _tenantId },
      select: {
        currentHoursDriven: true,
        currentOnDutyTime: true,
        currentHoursSinceBreak: true,
        cycleHoursUsed: true,
        hosData: true,
        hosDataSyncedAt: true,
      },
    });

    const currentStop = activeLoad?.stops.find((s) => s.status !== LOAD_STOP_STATUS.COMPLETED);
    const currentStopIdx = activeLoad?.stops.findIndex((s) => s === currentStop) ?? -1;
    const nextStop =
      currentStopIdx >= 0
        ? activeLoad?.stops.find((s, i) => i > currentStopIdx && s.status !== LOAD_STOP_STATUS.COMPLETED)
        : undefined;

    return {
      activeLoad: activeLoad
        ? {
            loadNumber: activeLoad.loadNumber,
            loadLabel: formatLoadLabel(activeLoad.loadNumber, activeLoad.referenceNumber),
            referenceNumber: activeLoad.referenceNumber ?? null,
            status: activeLoad.status,
            customerName: activeLoad.customerName,
            stops: activeLoad.stops.map((s) => ({
              name: s.stop.name,
              location: [s.stop.city, s.stop.state].filter(Boolean).join(', '),
              type: s.actionType,
              status: s.status,
            })),
            currentStop: currentStop
              ? {
                  name: currentStop.stop.name,
                  location: [currentStop.stop.city, currentStop.stop.state].filter(Boolean).join(', '),
                }
              : null,
            nextStop: nextStop
              ? {
                  name: nextStop.stop.name,
                  location: [nextStop.stop.city, nextStop.stop.state].filter(Boolean).join(', '),
                }
              : null,
          }
        : null,
      recentOpsMessages: recentMessages,
      activeAlerts: alerts,
      hos: driver
        ? {
            hoursDriven: driver.currentHoursDriven,
            onDutyTime: driver.currentOnDutyTime,
            hoursSinceBreak: driver.currentHoursSinceBreak,
            cycleHoursUsed: driver.cycleHoursUsed,
            syncedAt: driver.hosDataSyncedAt?.toISOString(),
          }
        : null,
    };
  }
}
