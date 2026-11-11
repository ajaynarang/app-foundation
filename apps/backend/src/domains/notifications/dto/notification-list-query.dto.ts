import type { NotificationCategory } from '@appshore/db';
import { NotificationCategorySchema } from '@app/shared-types';
import { QueryEnum, QueryInt, QueryLimit } from '@appshore/kernel/shared/utils/query-dto';

export const NOTIFICATION_READ_STATES = ['unread', 'read'] as const;
export type NotificationReadState = (typeof NOTIFICATION_READ_STATES)[number];

/** `GET /notifications` — `status` (unread | read), `category`, `page` (from 1), `limit` (1…100, default 20). */
export class NotificationListQueryDto {
  @QueryEnum(NOTIFICATION_READ_STATES)
  status?: NotificationReadState;

  @QueryEnum(NotificationCategorySchema.options)
  category?: NotificationCategory;

  @QueryInt({ min: 1 })
  page?: number;

  @QueryLimit()
  limit?: number;
}
