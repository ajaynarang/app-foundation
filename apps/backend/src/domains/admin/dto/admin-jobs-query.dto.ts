import type { JobStatus } from '@appshore/db';
import { JobStatusSchema } from '@app/shared-types';
import { QueryEnumList, QueryInt, QueryLimit, QueryString } from '@appshore/kernel/shared/utils/query-dto';
import { QueryDateText } from '../../../shared/dto/query-date-text';

/** The super-admin tenant filter: the numeric tenant id. An Int4: larger is a 400, never a driver overflow. */
const TENANT_DB_ID_RANGE = { min: 1, max: 2_147_483_647 } as const;

/**
 * `GET /admin/jobs` — `tenant_id` (numeric), `category`, `type`, `status` (comma-joined), `date_from`, `date_to`,
 * `limit` (1…100, default 20), `offset`.
 */
export class AdminJobListQueryDto {
  @QueryInt({ name: 'tenant_id', ...TENANT_DB_ID_RANGE })
  tenantId?: number;

  @QueryString()
  category?: string;

  @QueryString()
  type?: string;

  /** Comma-joined (or repeated) job statuses. */
  @QueryEnumList(JobStatusSchema.options, { name: 'status' })
  statuses?: JobStatus[];

  @QueryDateText('date_from')
  dateFrom?: string;

  @QueryDateText('date_to')
  dateTo?: string;

  @QueryLimit({ default: 20 })
  limit!: number;

  @QueryInt({ min: 0, default: 0 })
  offset!: number;
}

/** `GET /admin/jobs/metrics` and `GET /admin/jobs/categories/summary` (where it is required) — `tenant_id`. */
export class AdminJobsTenantQueryDto {
  @QueryInt({ name: 'tenant_id', ...TENANT_DB_ID_RANGE })
  tenantId?: number;
}
