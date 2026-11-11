import { InvitationStatus } from '@appshore/db';
import { CursorQueryDto, QueryEnum } from '@appshore/kernel/shared/utils/query-dto';
import type { InvitationListQuery } from '../user-invitations.service';

/** `GET /invitations` — `limit`, `cursor`, `status` (one invitation status; omitted: every invitation). */
export class InvitationListQueryDto extends CursorQueryDto implements InvitationListQuery {
  @QueryEnum(Object.values(InvitationStatus))
  status?: InvitationStatus;
}
