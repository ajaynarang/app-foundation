import { AnnouncementStatus } from '@appshore/db';
import { QueryEnum } from '@appshore/kernel/shared/utils/query-dto';

/** `GET /admin/broadcasts` — `status` (one announcement status; omitted: every broadcast). */
export class BroadcastListQueryDto {
  @QueryEnum(Object.values(AnnouncementStatus))
  status?: AnnouncementStatus;
}
