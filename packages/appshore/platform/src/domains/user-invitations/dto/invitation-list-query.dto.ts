import { InvitationStatus } from '@appshore/db';
import { QueryEnum } from '@appshore/kernel/shared/utils/query-dto';

/** `GET /invitations` — `status` (one invitation status; omitted: every invitation). */
export class InvitationListQueryDto {
  @QueryEnum(Object.values(InvitationStatus))
  status?: InvitationStatus;
}
