import { TenantStatus } from '@appshore/db';
import { ListQueryDto, QueryEnum } from '@appshore/kernel/shared/utils/query-dto';
import type { TenantListQuery } from '../tenants.service';

/** `GET /tenants` — `limit`, `cursor`, `q`, `status` (one tenant status; omitted: every tenant). */
export class TenantListQueryDto extends ListQueryDto implements TenantListQuery {
  @QueryEnum(Object.values(TenantStatus))
  status?: TenantStatus;
}
