import { FeedbackStatusEnum, type FeedbackStatus } from '@app/shared-types';
import { CursorQueryDto, QueryEnum, QueryInt } from '@appshore/kernel/shared/utils/query-dto';
import { QueryDateText } from '../../../shared/dto/query-date-text';

export const FEEDBACK_LIST_CATEGORIES = ['bug', 'idea', 'general', 'uncategorized'] as const;
export type FeedbackListCategory = (typeof FEEDBACK_LIST_CATEGORIES)[number];

const SENTIMENT_RANGE = { min: 1, max: 5 } as const;

/**
 * `GET /admin/feedback` — `status`, `category`, `tenant_id` (numeric), `sentiment_min`, `sentiment_max` (1…5),
 * `from`, `to`, `limit` (1…100, default 50), `cursor`.
 */
export class ListFeedbackQueryDto extends CursorQueryDto {
  // The canonical uppercase enum: it goes straight to the Prisma `status` filter.
  @QueryEnum(FeedbackStatusEnum.options)
  status?: FeedbackStatus;

  @QueryEnum(FEEDBACK_LIST_CATEGORIES)
  category?: FeedbackListCategory;

  /** The numeric tenant id. An Int4: larger is a 400, never a driver overflow. */
  @QueryInt({ name: 'tenant_id', min: 1, max: 2_147_483_647 })
  tenantId?: number;

  @QueryInt({ name: 'sentiment_min', ...SENTIMENT_RANGE })
  sentimentMin?: number;

  @QueryInt({ name: 'sentiment_max', ...SENTIMENT_RANGE })
  sentimentMax?: number;

  @QueryDateText()
  from?: string;

  @QueryDateText()
  to?: string;
}
