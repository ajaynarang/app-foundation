import { Controller, Get, Post, Delete, Req, Res, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Public } from '../../../auth/decorators/public.decorator';
import { SkipThrottle } from '@nestjs/throttler';
import { OAuthTokenGuard } from '../../platform/oauth-provider/oauth-token.guard';
import { AgentRateLimitGuard } from './guards/agent-rate-limit.guard';
import { ApiKeyAuthGuard } from '../../platform/api-keys/guards/api-key-auth.guard';
import { McpServerService } from './mcp-server.service';
import type { OAuthUser } from '../../platform/oauth-provider/oauth-token.guard';
import type { AgentPrincipal } from '../agent-contract/agent-principal';

@ApiTags('MCP')
@Controller('mcp')
export class McpServerController {
  constructor(private readonly mcpService: McpServerService) {}

  /**
   * POST /mcp — MCP Streamable HTTP transport endpoint.
   * Protected by OAuth Bearer token (not internal JWT).
   */
  @Post()
  @Public()
  @UseGuards(OAuthTokenGuard, AgentRateLimitGuard)
  @ApiOperation({ summary: 'MCP Streamable HTTP endpoint' })
  async handleMcpRequest(@Req() req: Request, @Res() res: Response) {
    const oauthUser = (req as any).oauthUser as OAuthUser;
    await this.mcpService.handleRequest(req, res, oauthUser);
  }

  /**
   * POST /mcp/apikey — MCP Streamable HTTP endpoint for API-key principals.
   * Bearer is a Sally API key (sk_live_…), not an OAuth access token.
   */
  @Post('apikey')
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
  @SkipThrottle()
  @ApiOperation({ summary: 'MCP SSE stream (not supported — stateless mode)' })
  // eslint-disable-next-line @typescript-eslint/require-await -- satisfies async controller contract
  async handleSseStream(@Res() res: Response) {
    res.status(HttpStatus.METHOD_NOT_ALLOWED).json({
      error: 'Method Not Allowed',
      message: 'This server operates in stateless mode and does not support SSE streams',
    });
  }

  /**
   * DELETE /mcp — Session termination.
   */
  @Delete()
  @Public()
  @UseGuards(OAuthTokenGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Terminate MCP session' })
  // eslint-disable-next-line @typescript-eslint/require-await -- satisfies async controller contract
  async terminateSession(@Res() res: Response) {
    // Stateless mode — no session to terminate
    res.json({ status: 'ok' });
  }
}
