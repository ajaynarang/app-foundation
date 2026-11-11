import { QueryString } from '@appshore/kernel/shared/utils/query-dto';

/** `GET /dev/users` — `tenant_id` (the tenant's public slug, optional filter). */
export class DevUsersQueryDto {
  @QueryString({ name: 'tenant_id' })
  tenantId?: string;
}
