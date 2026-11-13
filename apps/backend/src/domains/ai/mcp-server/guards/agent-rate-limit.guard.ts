import { ApiErrorCode } from '@app/shared-types';
import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { RateLimitService } from '../../agent-contract/rate-limit.service';
import type { AgentPrincipal } from '@appshore/platform/auth/agent-principal';

@Injectable()
export class AgentRateLimitGuard implements CanActivate {
  constructor(private readonly rateLimit: RateLimitService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      agentPrincipal?: AgentPrincipal;
      apiKey?: { rateLimitPerMinute?: number };
    }>();
    const principal = req.agentPrincipal;
    if (!principal) return true;

    const overrides =
      principal.kind === 'api_key' && req.apiKey?.rateLimitPerMinute
        ? { rateLimitPerMinute: req.apiKey.rateLimitPerMinute }
        : {};

    const result = await this.rateLimit.consume(principal, 1, overrides);

    const res = context.switchToHttp().getResponse<{ setHeader: (k: string, v: string) => void }>();
    res.setHeader('X-RateLimit-Limit', String(result.limit));
    res.setHeader('X-RateLimit-Remaining', String(result.remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.floor(result.resetAt.getTime() / 1000)));

    if (!result.allowed) {
      const retryAfter = Math.max(1, Math.ceil((result.resetAt.getTime() - Date.now()) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      const detail =
        result.budget === 'workspace'
          ? 'This workspace has reached its agent request limit for this minute. Try again shortly.'
          : 'Rate limit reached for this agent. Try again shortly.';
      throw new HttpException(
        // The budget, limit and wait travel in the X-RateLimit-* / Retry-After headers; the body is the envelope.
        { code: ApiErrorCode.RATE_LIMITED, detail },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
