import { InvitationStatus } from '@appshore/db';
import { CursorQueryDto, QueryEnumList } from '@appshore/kernel/shared/utils/query-dto';
import type { InvitationListQuery } from '../user-invitations.service';

/**
 * `GET /invitations` — `limit`, `cursor`, `status` (one invitation status, or several comma-joined; omitted:
 * every invitation).
 */
export class InvitationListQueryDto extends CursorQueryDto implements InvitationListQuery {
  @QueryEnumList(Object.values(InvitationStatus), { name: 'status' })
  statuses?: InvitationStatus[];
}
