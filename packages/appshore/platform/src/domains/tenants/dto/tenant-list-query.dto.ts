import { TenantStatus } from '@appshore/db';
import { QueryEnum } from '@appshore/kernel/shared/utils/query-dto';

/** `GET /tenants` — `status` (one tenant status; omitted: every tenant). */
export class TenantListQueryDto {
  @QueryEnum(Object.values(TenantStatus))
  status?: TenantStatus;
}
