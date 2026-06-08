import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { OAuthProviderService } from './oauth-provider.service';
import { fromOAuthUser } from '../../ai/agent-contract/agent-principal';
import type { AgentPrincipal } from '../../ai/agent-contract/agent-principal';
import type { AgentScope } from '@app/shared-types';

export interface OAuthUser {
  userId: string;
  tenantDbId: number;
  role: string;
  scopes: string[];
  clientId: string;
}

@Injectable()
export class OAuthTokenGuard implements CanActivate {
  private readonly logger = new Logger(OAuthTokenGuard.name);

  constructor(private readonly oauthService: OAuthProviderService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    this.logger.log(`OAuthTokenGuard invoked — method=${request.method}, url=${request.url}, hasAuth=${!!authHeader}`);

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        error: 'invalid_token',
        error_description: 'Bearer token required',
      });
    }

    const token = authHeader.substring(7);
    const payload = await this.oauthService.validateAccessToken(token);

    if (!payload) {
      this.logger.warn(`Token validation failed — method=${request.method}, url=${request.url}`);
      throw new UnauthorizedException({
        error: 'invalid_token',
        error_description: 'Token is invalid or expired',
      });
    }

    request.oauthUser = {
      userId: payload.sub,
      tenantDbId: payload.tenantId,
      role: payload.role,
      scopes: payload.scopes,
      clientId: payload.clientId,
    } satisfies OAuthUser;

    // The OAuth JWT signs `sub` as `String(user.id)` at issue time, so this
    // is a round-trip of a numeric DB id — the coercion is safe here. The
    // factory asserts Number.isInteger so a malformed token throws rather
    // than silently writing NaN to the audit log.
    (request as unknown as { agentPrincipal: AgentPrincipal }).agentPrincipal = fromOAuthUser({
      onBehalfOfUserDbId: Number(payload.sub),
      tenantDbId: payload.tenantId,
      role: payload.role,
      scopes: payload.scopes as AgentScope[],
      clientId: payload.clientId,
    });

    return true;
  }
}
