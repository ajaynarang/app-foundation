import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { ApiKeysService } from '../api-keys.service';
import { fromApiKey } from '../../../../auth/agent-principal';
import type { AgentPrincipal } from '../../../../auth/agent-principal';
import type { AgentScope } from '@app/shared-types';

interface AgentPrincipalRequest extends Request {
  agentPrincipal?: AgentPrincipal;
  apiKey?: unknown;
  user?: unknown;
}

@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AgentPrincipalRequest>();
    const authHeader = req.headers['authorization'];

    if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('API key required');
    }

    const key = authHeader.substring(7);
    const apiKey = await this.apiKeysService.validateKey(key, { ip: req.ip });
    if (!apiKey) {
      throw new UnauthorizedException('Invalid, expired, or IP-blocked API key');
    }

    req.agentPrincipal = fromApiKey({
      apiKeyId: apiKey.id,
      tenantId: (apiKey.user as { tenantId: number }).tenantId,
      userId: apiKey.userId,
      scopes: apiKey.scopes as AgentScope[],
      ipAllowlist: apiKey.ipAllowlist.length > 0 ? apiKey.ipAllowlist : undefined,
    });
    req.apiKey = apiKey;
    req.user = (apiKey as { user: unknown }).user;
    return true;
  }
}
