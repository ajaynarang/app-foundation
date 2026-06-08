import { Injectable } from '@nestjs/common';
import { RoutePlanStatus } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../../infrastructure/cache/sally-cache.service';
import { buildKey } from '../../../../infrastructure/cache/cache-key.constants';
import { CACHE_TTL_HOT_15S } from '../../../../constants/cache.constants';
import type { MessageSummaryItemDto, MessageSummaryResponseDto } from '../command-center.types';

@Injectable()
export class MessageSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: SallyCacheService,
  ) {}

  async getMessageSummary(tenantId: number): Promise<MessageSummaryResponseDto> {
    const cacheKey = buildKey('sally:cmdcenter', 'messages', tenantId);
    const cached = await this.cache.get<MessageSummaryResponseDto>(cacheKey);
    if (cached) return cached;

    // 1. Get all active loads with driver and route info
    const activeLoads = await this.prisma.load.findMany({
      where: {
        tenantId,
        status: { in: ['ASSIGNED', 'IN_TRANSIT'] },
        driverId: { not: null },
      },
      select: {
        loadNumber: true,
        status: true,
        originCity: true,
        originState: true,
        destinationCity: true,
        destinationState: true,
        driver: { select: { driverId: true, name: true } },
        vehicle: { select: { unitNumber: true } },
        routePlanLoads: {
          where: { plan: { isActive: true, status: RoutePlanStatus.ACTIVE } },
          select: { plan: { select: { estimatedArrival: true } } },
          take: 1,
        },
      },
    });

    if (activeLoads.length === 0) {
      const empty: MessageSummaryResponseDto = {
        items: [],
        needsResponseCount: 0,
      };
      await this.cache.set(cacheKey, empty, CACHE_TTL_HOT_15S);
      return empty;
    }

    // 2-5. Messages are driver-keyed now — a load's messages live in the
    // driver's conversation, tagged with the load via `loadId`. Pull every
    // message tagged with one of the active loads, joined to its conversation
    // (for the dispatcher read marker), and bucket per load in memory.
    const loadNumbers = activeLoads.map((l) => l.loadNumber);
    const taggedMessages = await this.prisma.conversationMessage.findMany({
      where: {
        load: { tenantId, loadNumber: { in: loadNumbers } },
        role: { in: ['driver', 'dispatcher'] },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        content: true,
        role: true,
        createdAt: true,
        load: { select: { loadNumber: true } },
        conversation: { select: { dispatcherReadAt: true } },
      },
    });

    // Per-load: the latest message + the count of unread driver messages
    // (driver messages after the dispatcher last read that driver's thread).
    const lastByLoad = new Map<string, { content: string; role: string; createdAt: Date }>();
    const unreadByLoad = new Map<string, number>();
    for (const msg of taggedMessages) {
      const loadNumber = msg.load?.loadNumber;
      if (!loadNumber) continue;
      // Messages are ascending, so the last write wins as the latest.
      lastByLoad.set(loadNumber, { content: msg.content, role: msg.role, createdAt: msg.createdAt });
      const readAt = msg.conversation.dispatcherReadAt;
      if (msg.role === 'driver' && (readAt === null || msg.createdAt > readAt)) {
        unreadByLoad.set(loadNumber, (unreadByLoad.get(loadNumber) ?? 0) + 1);
      }
    }

    // 6. Build response items — include ALL active loads, even without messages
    const items: MessageSummaryItemDto[] = [];

    for (const load of activeLoads) {
      const lastMsg = lastByLoad.get(load.loadNumber) ?? null;
      const unread = unreadByLoad.get(load.loadNumber) ?? 0;

      items.push({
        loadNumber: load.loadNumber,
        status: load.status,
        origin: [load.originCity, load.originState].filter(Boolean).join(', ') || 'Unknown',
        destination: [load.destinationCity, load.destinationState].filter(Boolean).join(', ') || 'Unknown',
        driverName: load.driver?.name ?? 'Unknown',
        vehicleUnit: load.vehicle?.unitNumber ?? null,
        eta: load.routePlanLoads?.[0]?.plan?.estimatedArrival?.toISOString() ?? null,
        lastMessage: lastMsg
          ? {
              content: lastMsg.content,
              role: lastMsg.role as 'driver' | 'dispatcher',
              createdAt: lastMsg.createdAt.toISOString(),
            }
          : null,
        unreadCount: unread,
      });
    }

    // 7. Sort: unread first, then conversations with messages by recency, then no-message loads last
    items.sort((a, b) => {
      const aUnread = a.unreadCount > 0 ? 0 : 1;
      const bUnread = b.unreadCount > 0 ? 0 : 1;
      if (aUnread !== bUnread) return aUnread - bUnread;

      const aTime = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const bTime = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return bTime - aTime;
    });

    const needsResponseCount = items.filter((i) => i.unreadCount > 0).length;
    const result: MessageSummaryResponseDto = { items, needsResponseCount };

    await this.cache.set(cacheKey, result, CACHE_TTL_HOT_15S);
    return result;
  }
}
