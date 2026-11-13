import { MAX_ACTIVE_CONVERSATIONS } from '@app/shared-types';
import { QueryLimit } from '@appshore/kernel/shared/utils/query-dto';

/**
 * `GET /conversations` — `limit` (1…MAX_ACTIVE_CONVERSATIONS, default all of them). History holds at most
 * `MAX_ACTIVE_CONVERSATIONS` active conversations per person, so the list is bounded by the cap.
 */
export class ListConversationsQueryDto {
  @QueryLimit({ default: MAX_ACTIVE_CONVERSATIONS, max: MAX_ACTIVE_CONVERSATIONS })
  limit!: number;
}
