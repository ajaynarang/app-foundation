import { QueryLimit } from '@appshore/kernel/shared/utils/query-dto';

/** `GET /conversations` — `limit` (1…100, default 10). */
export class ListConversationsQueryDto {
  @QueryLimit({ default: 10 })
  limit!: number;
}
