import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true; // Skip tenant check for public routes
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Single-tenant mode: short-circuit — we never require a tenant claim.
    // JwtStrategy stamps the implicit tenant onto request.user, so manual
    // `where: { tenantId }` scoping continues to work.
    const multiTenancy = this.configService.get('multiTenancy', { infer: true });
    if (multiTenancy?.enabled === false) {
      return true;
    }

    // SUPER_ADMIN users don't have a tenant - skip tenant check for them
    if (user?.role === 'SUPER_ADMIN') {
      return true;
    }

    if (!user || !user.tenantId) {
      throw new UnauthorizedException('Tenant context missing');
    }

    // NOTE: this guard only ENFORCES tenant context. Consumers should read
    // tenant scoping from @CurrentUser(): `tenantDbId` (numeric, for queries)
    // and `tenantId` (public string id) — both set by JwtStrategy.validate.
    return true;
  }
}
