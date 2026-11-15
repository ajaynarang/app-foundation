import { z } from 'zod';
import { NotificationCategorySchema, NotificationCountSchema, NotificationTypeSchema } from '@app/shared-types';
import { defineResponseSchema } from '@appshore/platform/shared/openapi/api-result';
import { defineCursorListSchema } from '@appshore/platform/shared/openapi/common-responses';

/** The in-app inbox's response bodies the wire form of `toPublicNotification`, named once. */

const PublicNotificationSchema = z.object({
  notificationId: z.string(),
  type: NotificationTypeSchema,
  category: NotificationCategorySchema,
  title: z.string().nullable(),
  message: z.string().nullable(),
  actionUrl: z.string().nullable(),
  actionLabel: z.string().nullable(),
  iconType: z.string().nullable(),
  readAt: z.string().nullable(),
  groupCount: z.number().int(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
});

export const NotificationListResponse = defineCursorListSchema('NotificationList', PublicNotificationSchema);

/** `GET /notifications/count` — unread (and not dismissed) notifications, in total and per category. */
export const NotificationUnreadCountResponse = defineResponseSchema('NotificationUnreadCount', NotificationCountSchema);

/** A single-notification state change — `count` is 1, or 0 when the id is not the caller's (no error). */
export const NotificationChangeCountResponse = defineResponseSchema(
  'NotificationChangeCount',
  z.object({ count: z.number().int() }),
);

/** A bulk state change — how many notifications changed. */
export const NotificationBulkUpdateResponse = defineResponseSchema(
  'NotificationBulkUpdate',
  z.object({ updated: z.number().int() }),
);
