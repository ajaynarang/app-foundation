import type { NotificationCategory } from '@appshore/db';
import { NotificationCategorySchema } from '@app/shared-types';
import { CursorQueryDto, QueryEnum } from '@appshore/kernel/shared/utils/query-dto';

export const NOTIFICATION_READ_STATES = ['unread', 'read'] as const;
export type NotificationReadState = (typeof NOTIFICATION_READ_STATES)[number];

/** `GET /notifications` — `status` (unread | read), `category`, `limit` (1…100, default 50), `cursor`. */
export class NotificationListQueryDto extends CursorQueryDto {
  @QueryEnum(NOTIFICATION_READ_STATES)
  status?: NotificationReadState;

  @QueryEnum(NotificationCategorySchema.options)
  category?: NotificationCategory;
}
