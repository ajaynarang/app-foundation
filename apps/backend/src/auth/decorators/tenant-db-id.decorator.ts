import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Extracts the numeric database tenant ID from the request user object.
 * Use this decorator when you need to query the database with the tenant's numeric ID.
 */
export const TenantDbId = createParamDecorator((data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return request.user?.tenantDbId;
});
