import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel, type Notification, type NotificationType } from '@appshore/db';
import { buildKey } from '@appshore/kernel/infrastructure/cache/cache-key.constants';
import { isTestMarker } from '@appshore/kernel/shared/utils/test-marker.util';
import { PrismaService } from '../../../database/prisma.service';
import { AppCacheService } from '../../../cache/app-cache.service';
import { NotificationPolicyRegistry } from '../../notification-policy.registry';

export interface InAppNotificationParams {
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
  /** Rows of one type only merge within one scope — two tournaments never share a row. */
  groupScope?: string;
}

/** Notifications of one type landing inside one window collapse into a single row. */
const GROUP_WINDOW_MS = 10 * 60 * 1000;
/** Past this, a group stops absorbing and the next notification starts a fresh row. */
const GROUP_MAX_ITEMS = 20;
const GROUP_LABEL_FALLBACK = 'notifications';

/** The in-app channel: the durable row every other channel points back to. */
@Injectable()
export class InAppChannelService {
  private readonly logger = new Logger(InAppChannelService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: AppCacheService,
    private readonly policies: NotificationPolicyRegistry,
  ) {}

  /** Null means dropped (a test-marker string) — the caller records SKIPPED rather than SENT. */
  async create(params: InAppNotificationParams): Promise<Notification | null> {
    // A marker string on the internal path is always seeded/dev junk (E57-5). Drop it rather than
    // throw: this is a hot, fire-and-forget path, and a throw would 500 a legitimate flow.
    if (isTestMarker(params.title) || isTestMarker(params.message)) {
      this.logger.warn(`Dropped a notification with a test-marker string (type ${params.type})`);
      return null;
    }

    const result = await this.prisma.$transaction(
      async (tx) => {
        const now = new Date();
        const bucketStart = new Date(now.getTime() - GROUP_WINDOW_MS);
        const groupKey = this.buildGroupKey(params, now);

        // Match on the key itself, not merely "has one": a lookup on type+user+tenant alone
        // merged two tournaments' approvals into one row carrying the first one's metadata.
        const existingGroup = await tx.notification.findFirst({
          where: {
            type: params.type,
            userId: params.recipientId,
            tenantId: params.tenantId ?? undefined,
            groupKey,
            createdAt: { gte: bucketStart },
            dismissedAt: null,
          },
          orderBy: { createdAt: 'desc' },
        });

        if (existingGroup && existingGroup.groupCount < GROUP_MAX_ITEMS) {
          const meta = (existingGroup.metadata as Record<string, any>) ?? {};
          const items = meta.items ?? [];
          items.push({ title: params.title, message: params.message, actionUrl: params.actionUrl });
          const newCount = existingGroup.groupCount + 1;

          return tx.notification.update({
            where: { id: existingGroup.id },
            data: {
              groupCount: newCount,
              message: `${newCount} ${this.groupLabel(params.type)}`,
              metadata: { ...meta, items },
              readAt: null,
            },
          });
        }

        return tx.notification.create({
          data: {
            type: params.type,
            channel: NotificationChannel.IN_APP,
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
            metadata: {
              ...params.metadata,
              items: [{ title: params.title, message: params.message, actionUrl: params.actionUrl }],
            },
            sentAt: new Date(),
            groupKey,
            groupCount: 1,
          },
        });
      },
      { isolationLevel: 'Serializable' },
    );

    await this.cache.del(buildKey('app:notifications', 'count', params.recipientId));

    return result;
  }

  private buildGroupKey(params: InAppNotificationParams, now: Date): string {
    const bucket = Math.floor(now.getTime() / GROUP_WINDOW_MS);
    return `${params.type}:${params.tenantId ?? 0}:${params.groupScope ?? '-'}:${bucket}`;
  }

  private groupLabel(type: NotificationType): string {
    return this.policies.get(type).groupLabel ?? GROUP_LABEL_FALLBACK;
  }
}
