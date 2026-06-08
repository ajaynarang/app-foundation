import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

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
