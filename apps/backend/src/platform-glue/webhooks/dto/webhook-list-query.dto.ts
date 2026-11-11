import { QueryInt, QueryLimit } from '@appshore/kernel/shared/utils/query-dto';
import { QueryCalendarDate } from '../../../shared/dto/query-date-text';

/** `GET /webhooks` — `limit` (1…100, default 20), `offset`. */
export class WebhookListQueryDto {
  @QueryLimit({ default: 20 })
  limit!: number;

  @QueryInt({ min: 0, default: 0 })
  offset!: number;
}

/** `GET /webhooks/:id/logs` — `limit`, `offset`, `date_from` / `date_to` (YYYY-MM-DD, read as UTC days). */
export class WebhookLogListQueryDto extends WebhookListQueryDto {
  @QueryCalendarDate('date_from')
  dateFrom?: string;

  @QueryCalendarDate('date_to')
  dateTo?: string;
}
