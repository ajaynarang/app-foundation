import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { LoadStatus } from '@prisma/client';
import type { DriverConversationSummary, LoadMessage, SendDriverMessageInput } from '@sally/shared-types';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../../infrastructure/cache/sally-cache.service';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';
import { buildKey } from '../../../../infrastructure/cache/cache-key.constants';
import { CACHE_TTL_HOT_15S, TOWER_CACHE_NAMESPACE } from '../../../../constants/cache.constants';
import { PushService } from '../../../../infrastructure/push/push.service';
import { DRIVER_CONVERSATION_USER_MODE, driverConversationId } from '../../loads/driver-messages.constants';

/** A dispatcher push preview is truncated to this many chars. */
const PUSH_PREVIEW_MAX = 80;

/** Last-message preview is truncated to this many chars for the triage row. */
const PREVIEW_MAX = 120;

/** Load statuses whose load counts as the driver's "active" load for tagging. */
const ACTIVE_LOAD_STATUSES = [LoadStatus.ASSIGNED, LoadStatus.IN_TRANSIT];

type WhoSpokeLast = DriverConversationSummary['whoSpokeLast'];

/**
 * Driver-keyed conversation reads + writes for the Tower Messages inbox.
 *
 * One persistent `Conversation` per driver (`userMode = driver_dispatch`).
 * The triage list is cached HOT (15s) — a regional fleet has tens of drivers,
 * so the list query is small and bounded.
 */
@Injectable()
export class DriverConversationsService {
  private readonly logger = new Logger(DriverConversationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: SallyCacheService,
    private readonly events: DomainEventService,
    private readonly pushService: PushService,
  ) {}

  /** Triage list — one row per driver conversation, most-recent first. */
  async listConversations(tenantId: number): Promise<DriverConversationSummary[]> {
    return this.cache.getOrSet<DriverConversationSummary[]>(
      buildKey(TOWER_CACHE_NAMESPACE, 'driver-conversations', tenantId),
      () => this.fetchConversations(tenantId),
      CACHE_TTL_HOT_15S,
    );
  }

  private async fetchConversations(tenantId: number): Promise<DriverConversationSummary[]> {
    const conversations = await this.prisma.conversation.findMany({
      where: { tenantId, userMode: DRIVER_CONVERSATION_USER_MODE },
      select: {
        id: true,
        dispatcherReadAt: true,
        driver: { select: { driverId: true, name: true } },
        // Newest message — drives the preview + whoSpokeLast + current load.
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            content: true,
            role: true,
            createdAt: true,
            load: { select: { loadNumber: true, referenceNumber: true } },
          },
        },
      },
    });

    const unreadByConversation = await this.unreadCounts(tenantId, conversations);

    const rows: DriverConversationSummary[] = [];
    for (const convo of conversations) {
      // A conversation with no resolvable driver is not surfaced.
      if (!convo.driver) continue;
      const last = convo.messages[0] ?? null;
      rows.push({
        driverId: convo.driver.driverId,
        driverName: convo.driver.name,
        currentLoadNumber: last?.load?.loadNumber ?? null,
        currentLoadReference: last?.load?.referenceNumber ?? null,
        lastMessage: last ? this.truncate(last.content) : null,
        lastMessageAt: last ? last.createdAt.toISOString() : null,
        unreadCount: unreadByConversation.get(convo.id) ?? 0,
        whoSpokeLast: (last?.role as WhoSpokeLast) ?? null,
        // Wired to a real alert join in a follow-up — see the implementation plan.
        hasActiveAlert: false,
      });
    }

    // Most-recent activity first — a null lastMessageAt sinks to the bottom.
    rows.sort((a, b) => {
      const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return tb - ta;
    });
    return rows;
  }

  /**
   * Unread driver-message count per conversation, in ONE query. A message is
   * unread when the driver sent it after the dispatcher last read that thread.
   * Per-conversation read cutoffs can't be expressed in a `groupBy`, so we
   * pull the (small, bounded) set of driver messages once and bucket them in
   * memory against each conversation's own `dispatcherReadAt`.
   */
  private async unreadCounts(
    tenantId: number,
    conversations: { id: number; dispatcherReadAt: Date | null }[],
  ): Promise<Map<number, number>> {
    const counts = new Map<number, number>();
    if (conversations.length === 0) return counts;

    const readCutoff = new Map(conversations.map((c) => [c.id, c.dispatcherReadAt]));
    const driverMessages = await this.prisma.conversationMessage.findMany({
      where: {
        role: 'driver',
        conversation: { tenantId, userMode: DRIVER_CONVERSATION_USER_MODE },
      },
      select: { conversationId: true, createdAt: true },
    });

    for (const msg of driverMessages) {
      const cutoff = readCutoff.get(msg.conversationId) ?? null;
      if (cutoff === null || msg.createdAt > cutoff) {
        counts.set(msg.conversationId, (counts.get(msg.conversationId) ?? 0) + 1);
      }
    }
    return counts;
  }

  private truncate(text: string): string {
    return text.length > PREVIEW_MAX ? `${text.slice(0, PREVIEW_MAX - 1)}…` : text;
  }

  /**
   * The thread for one driver — messages oldest-first. Empty if none yet.
   *
   * `loadNumberFilter` narrows the thread to messages tagged with one load —
   * used by the load detail Activity tab, which shows just that load's
   * messages within the driver's single conversation.
   */
  async getThread(tenantId: number, driverId: string, loadNumberFilter?: string): Promise<LoadMessage[]> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { conversationId: driverConversationId(tenantId, driverId), tenantId },
      select: {
        messages: {
          where: loadNumberFilter ? { load: { loadNumber: loadNumberFilter } } : undefined,
          orderBy: { createdAt: 'asc' },
          select: {
            messageId: true,
            role: true,
            content: true,
            inputMode: true,
            createdAt: true,
            load: { select: { loadNumber: true, referenceNumber: true } },
          },
        },
      },
    });
    if (!conversation) return [];
    return conversation.messages.map((m) => ({
      id: m.messageId,
      role: m.role as LoadMessage['role'],
      content: m.content,
      senderId: m.inputMode,
      createdAt: m.createdAt.toISOString(),
      loadNumber: m.load?.loadNumber ?? null,
      loadReference: m.load?.referenceNumber ?? null,
    }));
  }

  /**
   * Mark a driver thread read. `viewer` is which side is reading — a
   * dispatcher stamps `dispatcherReadAt` (drives the Tower unread badge), a
   * driver stamps `driverReadAt` (drives the driver app's badge).
   */
  async markRead(tenantId: number, driverId: string, viewer: 'driver' | 'dispatcher' = 'dispatcher'): Promise<void> {
    await this.prisma.conversation.updateMany({
      where: { conversationId: driverConversationId(tenantId, driverId), tenantId },
      data: viewer === 'driver' ? { driverReadAt: new Date() } : { dispatcherReadAt: new Date() },
    });
    await this.cache.del(buildKey(TOWER_CACHE_NAMESPACE, 'driver-conversations', tenantId));
  }

  /**
   * Unread message count in one driver's thread, from `viewer`'s perspective —
   * messages the *other* role sent after `viewer` last read the thread.
   */
  async unreadForDriver(tenantId: number, driverId: string, viewer: 'driver' | 'dispatcher'): Promise<number> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { conversationId: driverConversationId(tenantId, driverId), tenantId },
      select: { id: true, dispatcherReadAt: true, driverReadAt: true },
    });
    if (!conversation) return 0;

    const readAt = viewer === 'driver' ? conversation.driverReadAt : conversation.dispatcherReadAt;
    const otherRole = viewer === 'driver' ? 'dispatcher' : 'driver';
    return this.prisma.conversationMessage.count({
      where: {
        conversationId: conversation.id,
        role: otherRole,
        createdAt: { gt: readAt ?? new Date(0) },
      },
    });
  }

  /**
   * Send a message into a driver thread.
   *
   * `loadNumber` resolution:
   *  - omitted (`undefined`) → defaults to the driver's current active load.
   *  - explicit `null` → a general (no-load) message.
   *  - explicit load number → tagged to that load.
   */
  async sendMessage(
    tenantId: number,
    driverId: string,
    body: SendDriverMessageInput,
    role: 'driver' | 'dispatcher',
    userId: string | null,
  ): Promise<LoadMessage> {
    const conversationId = driverConversationId(tenantId, driverId);
    const conversation = await this.prisma.conversation.upsert({
      where: { conversationId },
      create: {
        conversationId,
        tenant: { connect: { id: tenantId } },
        userMode: DRIVER_CONVERSATION_USER_MODE,
        driver: { connect: { driverId_tenantId: { driverId, tenantId } } },
        isActive: true,
      },
      update: {},
    });

    const taggedLoad = await this.resolveLoadTag(tenantId, driverId, body.loadNumber);

    const message = await this.prisma.conversationMessage.create({
      data: {
        messageId: `msg-${randomUUID()}`,
        conversationId: conversation.id,
        role,
        content: body.content.trim(),
        inputMode: role,
        loadId: taggedLoad?.id ?? null,
      },
    });

    // The Tower wire builds its live message item straight from this payload —
    // it must carry content / conversationId / driverId for a correct item.
    await this.events.emit(SALLY_EVENTS.MESSAGE_NEW, tenantId, {
      driverId,
      messageId: message.messageId,
      role: message.role,
      senderId: userId,
      content: message.content,
      conversationId: conversation.conversationId,
      userMode: conversation.userMode,
      title: conversation.title,
      createdAt: message.createdAt.toISOString(),
    });

    await this.cache.del(buildKey(TOWER_CACHE_NAMESPACE, 'driver-conversations', tenantId));

    // Push to the driver's device when a dispatcher sends. Fire-and-forget —
    // a push failure must never break message send.
    if (role === 'dispatcher') {
      void this.pushDriverNotification(tenantId, driverId, message.content);
    }

    return {
      id: message.messageId,
      role: message.role as LoadMessage['role'],
      content: message.content,
      createdAt: message.createdAt.toISOString(),
      loadNumber: taggedLoad?.loadNumber ?? null,
      loadReference: taggedLoad?.referenceNumber ?? null,
    };
  }

  /**
   * Resolve the per-message load tag to the tagged load, or null for a
   * general (no-load) message. Returns the load's id + public number +
   * reference so the caller can both persist the FK and echo the label.
   */
  private async resolveLoadTag(
    tenantId: number,
    driverId: string,
    loadNumber: string | null | undefined,
  ): Promise<{ id: number; loadNumber: string; referenceNumber: string | null } | null> {
    // Explicit null → a general message, no tag.
    if (loadNumber === null) return null;

    // Omitted → default to the driver's current active load (if any).
    if (loadNumber === undefined) {
      return this.prisma.load.findFirst({
        where: { tenantId, driver: { driverId }, status: { in: ACTIVE_LOAD_STATUSES } },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, loadNumber: true, referenceNumber: true },
      });
    }

    // Explicit load number → tag to that load.
    const load = await this.prisma.load.findFirst({
      where: { tenantId, loadNumber },
      select: { id: true, loadNumber: true, referenceNumber: true },
    });
    if (!load) throw new NotFoundException('That load could not be found');
    return load;
  }

  /**
   * Notify the driver's device of a new dispatcher message. Fire-and-forget:
   * resolves the driver's linked user, sends the push, and swallows any
   * failure with a log — messaging must never fail because push did.
   */
  private async pushDriverNotification(tenantId: number, driverId: string, content: string): Promise<void> {
    try {
      const driver = await this.prisma.driver.findFirst({
        where: { driverId, tenantId },
        select: { user: { select: { id: true } } },
      });
      if (!driver?.user) return;
      const body = content.length > PUSH_PREVIEW_MAX ? `${content.slice(0, PUSH_PREVIEW_MAX - 3)}...` : content;
      await this.pushService.sendPushToUser(driver.user.id, {
        title: 'New message from dispatch',
        body,
        url: '/driver/sally',
      });
    } catch (err) {
      this.logger.warn(`Driver push notification failed: ${(err as Error).message}`);
    }
  }
}
