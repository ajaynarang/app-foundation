import { HttpException, HttpStatus } from '@nestjs/common';
import { EXCEPTION_FILTERS_METADATA, GUARDS_METADATA } from '@nestjs/common/constants';
import { BearerChallengeFilter } from '@appshore/platform/domains/oauth-provider/bearer-challenge.filter';
import { OAuthTokenGuard } from '@appshore/platform/domains/oauth-provider/oauth-token.guard';
import { ApiKeyAuthGuard } from '@appshore/platform/domains/api-keys/guards/api-key-auth.guard';
import { GENEROUS_THROTTLE } from '@appshore/platform/shared/http/edge-throttle';
import { AgentRateLimitGuard } from '../guards/agent-rate-limit.guard';
import { McpRootController } from '../mcp-root.controller';
import { McpServerController } from '../mcp-server.controller';
import type { McpServerService } from '../mcp-server.service';

/**
 * The edge of the two MCP controllers. `api-contract.spec.ts` (rules `edge/*`) reads the same facts from source
 * text; this spec reads what Nest will really apply.
 */

type Handler = (...args: unknown[]) => unknown;
const guardsOf = (handler: Handler): unknown[] => Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];
const throttleOf = (target: object, name = 'default') => ({
  limit: Reflect.getMetadata(`THROTTLER:LIMIT${name}`, target),
  ttl: Reflect.getMetadata(`THROTTLER:TTL${name}`, target),
});
const skipsThrottle = (target: object) => Reflect.getMetadata('THROTTLER:SKIPdefault', target) === true;

const service = {} as McpServerService;

describe.each([
  ['McpRootController', McpRootController, new McpRootController(service)],
  ['McpServerController', McpServerController, new McpServerController(service)],
])('%s edge', (_name, controllerClass, controller) => {
  it('answers a 401 with the bearer challenge (BearerChallengeFilter on the class)', () => {
    expect(Reflect.getMetadata(EXCEPTION_FILTERS_METADATA, controllerClass)).toEqual([BearerChallengeFilter]);
  });

  it('caps floods with the generous throttle instead of skipping the throttle', () => {
    expect(throttleOf(controllerClass)).toEqual(GENEROUS_THROTTLE.default);
    for (const handler of [controller.handleMcpRequest, controller.handleSseStream, controller.terminateSession]) {
      expect(skipsThrottle(handler)).toBe(false);
    }
  });

  it('meters every OAuth-token route as an agent (AgentRateLimitGuard after the token guard)', () => {
    expect(guardsOf(controller.handleMcpRequest)).toEqual([OAuthTokenGuard, AgentRateLimitGuard]);
    expect(guardsOf(controller.terminateSession)).toEqual([OAuthTokenGuard, AgentRateLimitGuard]);
  });

  it('answers the SSE probe with 405 through the error envelope, not a hand-built body', async () => {
    const error = await controller.handleSseStream().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(HttpStatus.METHOD_NOT_ALLOWED);
  });
});

describe('McpServerController API-key route', () => {
  it('meters the API-key route as an agent', () => {
    expect(guardsOf(new McpServerController(service).handleApiKeyMcpRequest)).toEqual([
      ApiKeyAuthGuard,
      AgentRateLimitGuard,
    ]);
  });
});
