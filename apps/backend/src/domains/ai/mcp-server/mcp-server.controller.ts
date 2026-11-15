import {
  Controller,
  Get,
  Post,
  Delete,
  Req,
  Res,
  UseFilters,
  UseGuards,
  HttpCode,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Public } from '@appshore/platform/auth/decorators/public.decorator';
import { Throttle } from '@nestjs/throttler';
import { GENEROUS_THROTTLE } from '@appshore/platform/shared/http/edge-throttle';
import { BearerChallengeFilter } from '@appshore/platform/domains/oauth-provider/bearer-challenge.filter';
import { OAuthTokenGuard } from '@appshore/platform/domains/oauth-provider/oauth-token.guard';
import { AgentRateLimitGuard } from './guards/agent-rate-limit.guard';
import { ApiKeyAuthGuard } from '@appshore/platform/domains/api-keys/guards/api-key-auth.guard';
import { McpServerService } from './mcp-server.service';
import type { OAuthUser } from '@appshore/platform/domains/oauth-provider/oauth-token.guard';
import type { AgentPrincipal } from '@appshore/platform/auth/agent-principal';

@ApiTags('MCP')
@Controller('mcp')
@UseFilters(BearerChallengeFilter)
// The agent budget (AgentRateLimitGuard: per client, per key, per workspace) is the effective limit here. The edge
// throttle only caps floods, so it sits above every agent budget.
@Throttle(GENEROUS_THROTTLE)
export class McpServerController {
  constructor(private readonly mcpService: McpServerService) {}

  /**
   * POST /mcp — MCP Streamable HTTP transport endpoint.
   * Protected by OAuth Bearer token (not internal JWT).
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @Public()
  @UseGuards(OAuthTokenGuard, AgentRateLimitGuard)
  @ApiOperation({ summary: 'MCP Streamable HTTP endpoint' })
  async handleMcpRequest(@Req() req: Request, @Res() res: Response) {
    const oauthUser = (req as any).oauthUser as OAuthUser;
    await this.mcpService.handleRequest(req, res, oauthUser);
  }

  /**
   * POST /mcp/apikey — MCP Streamable HTTP endpoint for API-key principals.
   * Bearer is a the assistant API key (sk_live_…), not an OAuth access token.
   */
  @Post('apikey')
  @HttpCode(HttpStatus.OK)
  @Public()
  @UseGuards(ApiKeyAuthGuard, AgentRateLimitGuard)
  @ApiOperation({ summary: 'MCP endpoint for API-key principals' })
  async handleApiKeyMcpRequest(@Req() req: Request, @Res() res: Response) {
    const principal = (req as unknown as { agentPrincipal: AgentPrincipal }).agentPrincipal;
    await this.mcpService.handleRequestFromPrincipal(req, res, principal);
  }

  /**
   * GET /mcp — SSE stream for server-initiated messages.
   * Per MCP spec: server MUST return 405 if SSE is not supported.
   */
  @Get()
  @Public()
  @ApiOperation({ summary: 'MCP SSE stream (not supported — stateless mode; always 405)' })
  // eslint-disable-next-line @typescript-eslint/require-await -- satisfies async controller contract
  async handleSseStream(): Promise<never> {
    throw new HttpException(
      'This server operates in stateless mode and does not support SSE streams',
      HttpStatus.METHOD_NOT_ALLOWED,
    );
  }

  /**
   * DELETE /mcp — Session termination.
   */
  @Delete()
  @Public()
  @UseGuards(OAuthTokenGuard, AgentRateLimitGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Terminate MCP session' })
  // eslint-disable-next-line @typescript-eslint/require-await -- satisfies async controller contract
  async terminateSession(@Res() res: Response) {
    // Stateless mode — no session to terminate
    res.json({ status: 'ok' });
  }
}
