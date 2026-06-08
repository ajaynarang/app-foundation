import { Injectable, Logger } from '@nestjs/common';
import { LoadStopStatus } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

export interface TimelineEntry {
  id: string;
  type: 'sally' | 'operations' | 'alert' | 'driver' | 'system';
  content: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface LoadContext {
  loadNumber: string;
  status: string;
  origin?: string;
  destination?: string;
  customerName?: string;
  currentStop?: { name: string; location: string; eta?: string };
}

@Injectable()
export class DriverTimelineService {
  private readonly logger = new Logger(DriverTimelineService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getTimeline(
    tenantDbId: number,
    driverId: number,
    loadNumber?: string,
    cursor?: string,
    limit = 50,
  ): Promise<{
    entries: TimelineEntry[];
    cursor: string | null;
    loadContext: LoadContext | null;
  }> {
    // 1. Resolve active load (required before parallel fetches)
    const activeLoad = await this.resolveActiveLoad(tenantDbId, driverId, loadNumber);

    let loadContext: LoadContext | null = null;
    if (activeLoad) {
      const currentStop = activeLoad.stops.find((s) => s.status !== LoadStopStatus.COMPLETED);
      const origin = [activeLoad.originCity, activeLoad.originState].filter(Boolean).join(', ');
      const destination = [activeLoad.destinationCity, activeLoad.destinationState].filter(Boolean).join(', ');
      loadContext = {
        loadNumber: activeLoad.loadNumber || activeLoad.referenceNumber,
        status: activeLoad.status,
        origin: origin || undefined,
        destination: destination || undefined,
        customerName: activeLoad.customerName || undefined,
        currentStop: currentStop
          ? {
              name: currentStop.stop.name || 'Stop',
              location: [currentStop.stop.city, currentStop.stop.state].filter(Boolean).join(', '),
              eta: currentStop.appointmentDate?.toISOString(),
            }
          : undefined,
      };
    }

    const cursorDate = cursor ? new Date(cursor) : undefined;

    // 2. Fetch all data sources in parallel. Phase 2 Task 10 — alert.driverId
    // is now the Int FK on drivers.id, so we pass the numeric driverId
    // straight through (no slug conversion needed).
    const [dispatchEntries, sallyEntries, alertEntries] = await Promise.all([
      this.fetchDispatchMessages(tenantDbId, activeLoad, cursorDate, limit),
      this.fetchSallyMessages(tenantDbId, activeLoad, cursorDate, limit),
      this.fetchAlerts(tenantDbId, driverId, cursorDate),
    ]);

    // 3. Merge, sort chronologically (oldest first), trim
    const entries = [...dispatchEntries, ...sallyEntries, ...alertEntries];
    entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const trimmed = entries.slice(-limit);
    const nextCursor = trimmed.length >= limit && trimmed[0] ? trimmed[0].timestamp : null;

    return { entries: trimmed, cursor: nextCursor, loadContext };
  }

  private async resolveActiveLoad(tenantDbId: number, driverId: number, loadNumber?: string) {
    const loadSelect = {
      loadNumber: true,
      referenceNumber: true,
      status: true,
      originCity: true,
      originState: true,
      destinationCity: true,
      destinationState: true,
      customerName: true,
      stops: {
        orderBy: { sequenceOrder: 'asc' as const },
        select: {
          status: true,
          appointmentDate: true,
          stop: { select: { name: true, city: true, state: true } },
        },
      },
    };

    return loadNumber
      ? this.prisma.load.findFirst({
          where: { loadNumber, tenantId: tenantDbId },
          select: loadSelect,
        })
      : this.prisma.load.findFirst({
          where: {
            tenantId: tenantDbId,
            driverId,
            status: { in: ['ASSIGNED', 'IN_TRANSIT'] },
          },
          orderBy: { updatedAt: 'desc' },
          select: loadSelect,
        });
  }

  private async fetchDispatchMessages(
    tenantDbId: number,
    activeLoad: { loadNumber: string } | null,
    cursorDate: Date | undefined,
    limit: number,
  ): Promise<TimelineEntry[]> {
    if (!activeLoad) return [];

    // Messages are driver-keyed and tagged with a load — fetch this load's
    // tagged messages directly (the `loadId` FK), tenant-scoped via the load.
    const messages = await this.prisma.conversationMessage.findMany({
      where: {
        load: { tenantId: tenantDbId, loadNumber: activeLoad.loadNumber },
        ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return messages.map((msg) => ({
      id: msg.messageId,
      type: (msg.role === 'driver'
        ? 'driver'
        : msg.role === 'system'
          ? 'system'
          : 'operations') as TimelineEntry['type'],
      content: msg.content,
      timestamp: msg.createdAt.toISOString(),
      metadata: {
        loadNumber: activeLoad.loadNumber,
        messageId: msg.messageId,
        sentToOperations: msg.role === 'driver',
      },
    }));
  }

  private async fetchSallyMessages(
    tenantDbId: number,
    activeLoad: { loadNumber: string } | null,
    cursorDate: Date | undefined,
    limit: number,
  ): Promise<TimelineEntry[]> {
    const sallyConversationId = activeLoad
      ? `sally-driver-${tenantDbId}-${activeLoad.loadNumber}`
      : `sally-driver-${tenantDbId}-general`;

    const conversation = await this.prisma.conversation.findUnique({
      where: { conversationId: sallyConversationId },
      select: { id: true },
    });
    if (!conversation) return [];

    const messages = await this.prisma.conversationMessage.findMany({
      where: {
        conversationId: conversation.id,
        ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return messages.map((msg) => ({
      id: msg.messageId,
      type: (msg.role === 'user' ? 'driver' : 'sally') as TimelineEntry['type'],
      content: msg.content,
      timestamp: msg.createdAt.toISOString(),
      metadata: {
        card: msg.card ?? undefined,
        speakText: msg.speakText ?? undefined,
      },
    }));
  }

  private async fetchAlerts(
    tenantDbId: number,
    driverDbId: number,
    cursorDate: Date | undefined,
  ): Promise<TimelineEntry[]> {
    const alerts = await this.prisma.alert.findMany({
      where: {
        tenantId: tenantDbId,
        driverId: driverDbId,
        status: 'ACTIVE',
        ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return alerts.map((alert) => ({
      id: alert.alertId,
      type: 'alert' as const,
      content: alert.title,
      timestamp: alert.createdAt.toISOString(),
      metadata: {
        alertId: alert.alertId,
        severity: alert.priority,
        category: alert.category,
        acknowledgedAt: alert.acknowledgedAt?.toISOString(),
        recommendedAction: alert.recommendedAction,
        title: alert.title,
      },
    }));
  }
}
