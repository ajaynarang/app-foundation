import { CursorQueryDto } from '@appshore/kernel/shared/utils/query-dto';

/** `GET /super-admin/outbound/held-back` — `limit` (1…100) and `cursor`; newest first. */
export class ListOutboundSuppressionsQueryDto extends CursorQueryDto {}
