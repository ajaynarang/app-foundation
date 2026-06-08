import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { Configuration } from '../../config/configuration';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private configService: ConfigService<Configuration>,
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

    // Single-tenant mode: short-circuit to the implicit tenant. We never
    // require a tenant claim — every request resolves to the one seeded
    // tenant so manual `where: { tenantId }` scoping continues to work.
    const multiTenancy = this.configService.get('multiTenancy', { infer: true });
    if (multiTenancy?.enabled === false) {
      request.tenantId = multiTenancy.implicitTenantId;
      return true;
    }

    // SUPER_ADMIN users don't have a tenant - skip tenant check for them
    if (user?.role === 'SUPER_ADMIN') {
      return true;
    }

    if (!user || !user.tenantId) {
      throw new UnauthorizedException('Tenant context missing');
    }

    // Attach tenant context to request for easy access
    request.tenantId = user.tenantId;

    return true;
  }
}
