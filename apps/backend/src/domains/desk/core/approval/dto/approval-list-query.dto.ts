import { QueryEnum, QueryLimit } from '@appshore/kernel/shared/utils/query-dto';
import { APPROVAL_SCOPES, type ApprovalScope } from '../../types';

/** `GET /desk/approvals` — `scope` (mine | all; default by role), `limit` (1…100, default 50). */
export class ApprovalListQueryDto {
  @QueryEnum(APPROVAL_SCOPES)
  scope?: ApprovalScope;

  @QueryLimit({ default: 50 })
  limit!: number;
}
