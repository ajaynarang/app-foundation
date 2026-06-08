import { Injectable, ExecutionContext, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();
    const handler = context.getHandler()?.name;
    const controller = context.getClass()?.name;

    // Only log for MCP/OAuth routes to avoid noise
    if (request?.url === '/' || request?.url?.includes('/mcp')) {
      this.logger.log(
        `JwtAuthGuard — url=${request.url}, handler=${handler}, controller=${controller}, isPublic=${isPublic}`,
      );
    }

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  handleRequest<TUser = any>(err: any, user: TUser, info: any, context: ExecutionContext): TUser {
    // Call parent handleRequest — throws UnauthorizedException if auth fails
    const authenticatedUser = super.handleRequest(err, user, info, context);

    // Enrich AsyncLocalStorage log context with tenantId/userId from JWT payload.
    // Only for HTTP contexts — WebSocket and RPC contexts do not have an Express request.
    if (authenticatedUser && context.getType() === 'http') {
      const request = context.switchToHttp().getRequest();
      if (request?.setLogContext) {
        request.setLogContext({
          tenantId: String(authenticatedUser.tenantId ?? ''),
          userId: String(authenticatedUser.id ?? authenticatedUser.userId ?? ''),
        });
      }
    }

    return authenticatedUser;
  }
}
