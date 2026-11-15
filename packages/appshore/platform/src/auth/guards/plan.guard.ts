import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { stripQueryString } from '@appshore/kernel/shared/utils/log-redaction';
import { FEATURE_KEY } from '../decorators/require-feature.decorator';
import { NO_FEATURE_GATE_KEY } from '../decorators/no-feature-gate.decorator';
import { TenantEntitlementsService } from '../../domains/entitlements/tenant-entitlements.service';

/**
 * The last guard in the global chain: a route carrying `@RequireFeature(key)` (on the handler, else the class) runs
 * only for a workspace whose plan includes `key`. The rule itself is `TenantEntitlementsService`, shared with jobs,
 * handlers and the AI tool pipeline, so the API and every other surface cannot disagree.
 */
@Injectable()
export class PlanGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlements: TenantEntitlementsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // An explicit per-route opt-out beats the controller's gate. Read first and from the handler only (`get`, not
    // `getAllAndOverride`): `getAllAndOverride` treats an undefined handler value as "not set", so no decorator can
    // un-set a class gate by writing undefined over it, and a controller cannot opt its whole surface out.
    if (this.reflector.get<boolean>(NO_FEATURE_GATE_KEY, context.getHandler())) return true;

    const requiredFeature = this.reflector.getAllAndOverride<string>(FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredFeature) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const tenantDbId = user?.tenantDbId && user?.tenantId ? (user.tenantDbId as number) : null;
    await this.entitlements.assertFeature(tenantDbId, requiredFeature, {
      actor: { role: user?.role },
      route: `${request.method} ${request.route?.path ?? stripQueryString(request.url ?? '')}`,
    });
    return true;
  }
}
