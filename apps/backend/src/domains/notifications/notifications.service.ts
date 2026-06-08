import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { AppCacheService } from '../../../infrastructure/cache/app-cache.service';
import { buildKey } from '../../../infrastructure/cache/cache-key.constants';
import { CACHE_TTL_HOT_30S } from '../../../constants/cache.constants';
import { NotificationType } from '@prisma/client';

interface ListParams {
  status?: string;
  category?: string;
  page?: number;
  limit?: number;
}

interface CreateNotificationParams {
  recipientId: number;
  tenantId?: number;
  type: NotificationType;
  category: string;
  title: string;
  message: string;
  actionUrl?: string;
  actionLabel?: string;
  iconType?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class InAppNotificationService {
  private readonly logger = new Logger(InAppNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: AppCacheService,
  ) {}

  async listForUser(userId: number, params?: ListParams) {
    const page = params?.page || 1;
    const limit = params?.limit || 20;

    const where: any = {
      userId,
      channel: 'IN_APP',
      dismissedAt: null,
    };

    if (params?.status === 'unread') {
      where.readAt = null;
    } else if (params?.status === 'read') {
      where.readAt = { not: null };
    }

    if (params?.category) {
      where.category = params.category;
    }

    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return { data, total };
  }

  async getUnreadCount(userId: number) {
    return this.cache.getOrSet(
      buildKey('sally:notifications', 'count', userId),
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
    await this.cache.del(buildKey('sally:notifications', 'count', userId));
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
    await this.cache.del(buildKey('sally:notifications', 'count', userId));
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
    await this.cache.del(buildKey('sally:notifications', 'count', userId));
    return result;
  }

  async markAllRead(userId: number, category?: string) {
    const where: any = { userId, readAt: null };
    if (category) where.category = category;

    const result = await this.prisma.notification.updateMany({
      where,
      data: { readAt: new Date() },
    });
    await this.cache.del(buildKey('sally:notifications', 'count', userId));
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
    await this.cache.del(buildKey('sally:notifications', 'count', userId));
    return result;
  }

  async create(params: CreateNotificationParams) {
    const result = await this.prisma.$transaction(
      async (tx) => {
        const now = new Date();
        const bucketStart = new Date(now.getTime() - 10 * 60 * 1000); // 10 min window

        // Check for existing group
        const existingGroup = await tx.notification.findFirst({
          where: {
            type: params.type,
            userId: params.recipientId,
            tenantId: params.tenantId ?? undefined,
            groupKey: { not: null },
            createdAt: { gte: bucketStart },
            dismissedAt: null,
          },
          orderBy: { createdAt: 'desc' },
        });

        if (existingGroup && existingGroup.groupCount < 20) {
          const meta = (existingGroup.metadata as Record<string, any>) ?? {};
          const items = meta.items ?? [];
          items.push({
            title: params.title,
            message: params.message,
            actionUrl: params.actionUrl,
          });
          const newCount = existingGroup.groupCount + 1;

          return tx.notification.update({
            where: { id: existingGroup.id },
            data: {
              groupCount: newCount,
              message: `${newCount} ${this.getGroupLabel(params.type)}`,
              metadata: { ...meta, items },
              readAt: null,
            },
          });
        }

        // Create new notification
        const groupKey = `${params.type}:${params.tenantId ?? 0}:${Math.floor(now.getTime() / 600000)}`;
        return tx.notification.create({
          data: {
            type: params.type,
            channel: 'IN_APP',
            recipient: '',
            status: 'SENT',
            userId: params.recipientId,
            tenantId: params.tenantId,
            category: params.category as any,
            title: params.title,
            message: params.message,
            actionUrl: params.actionUrl,
            actionLabel: params.actionLabel,
            iconType: params.iconType,
            metadata: params.metadata
              ? {
                  ...params.metadata,
                  items: [
                    {
                      title: params.title,
                      message: params.message,
                      actionUrl: params.actionUrl,
                    },
                  ],
                }
              : {
                  items: [
                    {
                      title: params.title,
                      message: params.message,
                      actionUrl: params.actionUrl,
                    },
                  ],
                },
            sentAt: new Date(),
            groupKey,
            groupCount: 1,
          },
        });
      },
      { isolationLevel: 'Serializable' },
    );

    await this.cache.del(buildKey('sally:notifications', 'count', params.recipientId));

    return result;
  }

  private getGroupLabel(type: string): string {
    const labels: Record<string, string> = {
      INVOICE_GENERATED: 'invoices generated',
      INVOICE_SENT: 'invoices sent',
      PAYMENT_RECEIVED: 'payments received',
      INTEGRATION_SYNC_COMPLETED: 'syncs completed',
      INTEGRATION_SYNC_FAILED: 'sync failures',
      DRIVER_ACTIVATED: 'drivers activated',
      USER_JOINED: 'users joined',
    };
    return labels[type] ?? 'notifications';
  }
}
