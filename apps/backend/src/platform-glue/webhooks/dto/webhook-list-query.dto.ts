import { CursorQueryDto } from '@appshore/kernel/shared/utils/query-dto';
import { QueryCalendarDate } from '../../../shared/dto/query-date-text';

/** `GET /webhooks` — `limit` (1…100, default 50), `cursor`. */
export class WebhookListQueryDto extends CursorQueryDto {}

/** `GET /webhooks/:id/logs` — `limit`, `cursor`, `date_from` / `date_to` (YYYY-MM-DD, read as UTC days). */
export class WebhookLogListQueryDto extends WebhookListQueryDto {
  @QueryCalendarDate('date_from')
  dateFrom?: string;

  @QueryCalendarDate('date_to')
  dateTo?: string;
}
