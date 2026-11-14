import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RLS_SOURCE, isRlsTenantId, setRlsTenant } from '@appshore/kernel/infrastructure/rls/rls-context';

@Injectable()
export class RefreshJwtAuthGuard extends AuthGuard('jwt-refresh') {
  /**
   * The refresh route is public to the access-token guard, so this is where its request picks up its tenant context:
   * the session's workspace (`RefreshSession.tenantDbId`), so the refresh-token and membership work after validation
   * runs as that tenant. A super-admin session has no workspace and sets none.
   */
  handleRequest<TUser = any>(err: any, user: TUser, info: any, context: ExecutionContext, status?: any): TUser {
    const authenticated = super.handleRequest(err, user, info, context, status);
    const tenantDbId = (authenticated as { tenantDbId?: unknown } | undefined)?.tenantDbId;
    if (context.getType() === 'http' && isRlsTenantId(tenantDbId)) {
      setRlsTenant(tenantDbId, RLS_SOURCE.REFRESH);
    }
    return authenticated;
  }
}
