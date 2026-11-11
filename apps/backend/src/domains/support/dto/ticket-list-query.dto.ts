import type { SupportCategory, SupportPriority, SupportStatus } from '@appshore/db';
import { SupportCategorySchema, SupportPrioritySchema, SupportStatusSchema } from '@app/shared-types';
import { QueryEnum, QueryInt, QueryLimit, QuerySearch } from '@appshore/kernel/shared/utils/query-dto';

/** `GET /support/tickets` — `status`, `limit` (1…100, default 50), `offset`. */
export class TicketListQueryDto {
  @QueryEnum(SupportStatusSchema.options)
  status?: SupportStatus;

  @QueryLimit()
  limit?: number;

  @QueryInt({ min: 0 })
  offset?: number;
}

/**
 * `GET /support/admin/tickets` — `tenant_id` (numeric), `status`, `priority`, `category`, `q`, `limit`, `offset`.
 */
export class AdminTicketListQueryDto extends TicketListQueryDto {
  /** The numeric tenant id. An Int4: larger is a 400, never a driver overflow. */
  @QueryInt({ name: 'tenant_id', min: 1, max: 2_147_483_647 })
  tenantId?: number;

  @QueryEnum(SupportPrioritySchema.options)
  priority?: SupportPriority;

  @QueryEnum(SupportCategorySchema.options)
  category?: SupportCategory;

  @QuerySearch()
  q?: string;
}
