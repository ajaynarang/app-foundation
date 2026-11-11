import { QueryInt, QueryLimit, QuerySearch, QueryString } from '@appshore/kernel/shared/utils/query-dto';
import { QueryDateText } from '../../../shared/dto/query-date-text';

/**
 * `GET /admin/events` — `q`, `tenant` (the tenant's public slug), `actor_type`, `since`, `until`, `limit`
 * (1…100, default 50), `offset`.
 */
export class AdminEventListQueryDto {
  @QuerySearch()
  q?: string;

  @QueryString({ name: 'tenant' })
  tenantId?: string;

  @QueryString({ name: 'actor_type' })
  actorType?: string;

  @QueryDateText()
  since?: string;

  @QueryDateText()
  until?: string;

  @QueryLimit({ default: 50 })
  limit!: number;

  @QueryInt({ min: 0, default: 0 })
  offset!: number;
}
