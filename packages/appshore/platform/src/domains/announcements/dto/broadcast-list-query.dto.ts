import { AnnouncementStatus } from '@appshore/db';
import { CursorQueryDto, QueryEnum } from '@appshore/kernel/shared/utils/query-dto';
import type { BroadcastListQuery } from '../announcements.service';

/** `GET /admin/broadcasts` — `limit`, `cursor`, `status`. */
export class BroadcastListQueryDto extends CursorQueryDto implements BroadcastListQuery {
  @QueryEnum(Object.values(AnnouncementStatus))
  status?: AnnouncementStatus;
}
