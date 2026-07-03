import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { DEV_AUTH_HEADER, DEV_AUTH_SECRET_ENV } from '../dev-auth.constants';
import { getEnvType } from '@appshore/kernel/shared/utils/env-type';

@Injectable()
export class DevAuthGuard implements CanActivate {
  private readonly logger = new Logger(DevAuthGuard.name);

  canActivate(ctx: ExecutionContext): boolean {
    // Hard-block in the production env-type (staging runs with
    // NODE_ENV=production but ENV_TYPE=sandbox — dev routes stay open there).
    // Belt-and-suspenders: primary defense is Doppler hygiene (secret unset
    // in app-backend/prd). This guardrail ensures a single misconfiguration
    // cannot expose the route.
    if (getEnvType() === 'production') {
      throw new NotFoundException();
    }

    const secret = process.env[DEV_AUTH_SECRET_ENV];
    if (!secret) {
      throw new NotFoundException();
    }

    const req = ctx.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      ip?: string;
    }>();

    const raw = req.headers[DEV_AUTH_HEADER];
    const provided = Array.isArray(raw) ? raw[0] : raw;

    if (!provided) {
      this.logger.warn(`dev-auth: missing header from ip=${req.ip ?? 'unknown'}`);
      throw new UnauthorizedException();
    }

    const a = Buffer.from(secret);
    const b = Buffer.from(provided);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      this.logger.warn(`dev-auth: secret mismatch from ip=${req.ip ?? 'unknown'}`);
      throw new UnauthorizedException();
    }
    return true;
  }
}
