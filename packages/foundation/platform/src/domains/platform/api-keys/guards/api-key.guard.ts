import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ApiKeysService } from '../api-keys.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private apiKeysService: ApiKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('API key required');
    }

    const key = authHeader.substring(7);
    const apiKey = await this.apiKeysService.validateKey(key);

    if (!apiKey) {
      throw new UnauthorizedException('Invalid or expired API key');
    }

    // Attach to request for use in controllers
    request.apiKey = apiKey;
    request.user = apiKey.user;

    return true;
  }
}
