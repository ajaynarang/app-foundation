import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { AppCacheService } from '@appshore/platform/infrastructure/cache/app-cache.service';
import { buildKey } from '@appshore/kernel/infrastructure/cache/cache-key.constants';
import { CACHE_TTL_HOT_30S } from '@appshore/kernel/constants/cache.constants';
import { type NotificationCategory, type Prisma } from '@appshore/db';
import type { CursorList } from '@app/shared-types';
import {
  buildCursorPage,
  clampCursorLimit,
  encodeCursor,
  keysetWhere,
} from '@appshore/kernel/shared/utils/cursor-pagination';
import { toPublicNotification, type PublicNotification } from './notification.serializer';

interface ListParams {
  status?: string;
  category?: NotificationCategory;
  limit?: number;
  cursor?: string;
}

const INBOX_KEYSET = { field: 'createdAt', idField: 'notificationId', kind: 'date', direction: 'desc' } as const;

@Injectable()
export class InAppNotificationService {
  private readonly logger = new Logger(InAppNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: AppCacheService,
  ) {}

  /** The caller's inbox, newest first, as a cursor list. The tiebreak is the public notification id. */
  async listForUser(userId: number, params: ListParams = {}): Promise<CursorList<PublicNotification>> {
    const take = clampCursorLimit(params.limit);
    // Decoded before any query runs: a malformed cursor is a 400 and costs nothing.
    const keyset = params.cursor ? keysetWhere({ ...INBOX_KEYSET, cursor: params.cursor }) : undefined;

    const where: Prisma.NotificationWhereInput = {
      userId,
      channel: 'IN_APP',
      dismissedAt: null,
    };

    if (params.status === 'unread') {
      where.readAt = null;
    } else if (params.status === 'read') {
      where.readAt = { not: null };
    }

    if (params.category) {
      where.category = params.category;
    }

    const [rows, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: keyset ? { AND: [where, keyset] } : where,
        orderBy: [{ createdAt: 'desc' }, { notificationId: 'desc' }],
        take: take + 1,
      }),
      this.prisma.notification.count({ where }),
    ]);
    const page = buildCursorPage(rows, take, (row) => encodeCursor(row.createdAt, row.notificationId));
    return { items: page.items.map(toPublicNotification), nextCursor: page.nextCursor, total };
  }

  async getUnreadCount(userId: number) {
    return this.cache.getOrSet(
      buildKey('app:notifications', 'count', userId),
      async () => {
        const counts = await this.prisma.notification.groupBy({
          by: ['category'],
          where: {
            userId,
            readAt: null,
            dismissedAt: null,
          },
          _count: { id: true },
        });

        const result = { total: 0, system: 0, team: 0, billing: 0 };
        for (const row of counts) {
          const count = row._count.id;
          result.total += count;
          const key = row.category.toLowerCase() as keyof typeof result;
          if (key in result && key !== 'total') {
            result[key] = count;
          }
        }
        return result;
      },
      CACHE_TTL_HOT_30S,
    );
  }

  async markAsRead(notificationId: string, userId: number) {
    const result = await this.prisma.notification.updateMany({
      where: { notificationId, userId },
      data: { readAt: new Date() },
    });
    if (result.count === 0) {
      this.logger.warn(`markAsRead: notification ${notificationId} not found for user ${userId}`);
    }
    await this.cache.del(buildKey('app:notifications', 'count', userId));
    return result;
  }

  async dismiss(notificationId: string, userId: number) {
    const result = await this.prisma.notification.updateMany({
      where: { notificationId, userId },
      data: { dismissedAt: new Date() },
    });
    if (result.count === 0) {
      this.logger.warn(`dismiss: notification ${notificationId} not found for user ${userId}`);
    }
    await this.cache.del(buildKey('app:notifications', 'count', userId));
    return result;
  }

  async markAsUnread(notificationId: string, userId: number) {
    const result = await this.prisma.notification.updateMany({
      where: {
        notificationId,
        userId,
        dismissedAt: null,
      },
      data: {
        readAt: null,
      },
    });
    await this.cache.del(buildKey('app:notifications', 'count', userId));
    return result;
  }

  async markAllRead(userId: number, category?: string) {
    const where: any = { userId, readAt: null };
    if (category) where.category = category;

    const result = await this.prisma.notification.updateMany({
      where,
      data: { readAt: new Date() },
    });
    await this.cache.del(buildKey('app:notifications', 'count', userId));
    return result;
  }

  async dismissAllRead(userId: number) {
    const result = await this.prisma.notification.updateMany({
      where: {
        userId,
        readAt: { not: null },
        dismissedAt: null,
      },
      data: { dismissedAt: new Date() },
    });
    await this.cache.del(buildKey('app:notifications', 'count', userId));
    return result;
  }
}
