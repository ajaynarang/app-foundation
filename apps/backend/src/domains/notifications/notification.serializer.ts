import type { Notification } from '@appshore/db';

/** An in-app notification as the API shows it — named by its public id, never the row's Int PK or FKs. */
export interface PublicNotification {
  notificationId: string;
  type: Notification['type'];
  category: Notification['category'];
  title: string | null;
  message: string | null;
  actionUrl: string | null;
  actionLabel: string | null;
  iconType: string | null;
  readAt: Date | null;
  groupCount: number;
  metadata: Notification['metadata'];
  createdAt: Date;
}

export function toPublicNotification(row: Notification): PublicNotification {
  return {
    notificationId: row.notificationId,
    type: row.type,
    category: row.category,
    title: row.title,
    message: row.message,
    actionUrl: row.actionUrl,
    actionLabel: row.actionLabel,
    iconType: row.iconType,
    readAt: row.readAt,
    groupCount: row.groupCount,
    metadata: row.metadata,
    createdAt: row.createdAt,
  };
}
