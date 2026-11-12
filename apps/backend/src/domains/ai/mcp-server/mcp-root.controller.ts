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
import { Request, Response } from 'express';
import { Public } from '@appshore/platform/auth/decorators/public.decorator';
import { Throttle } from '@nestjs/throttler';
import { GENEROUS_THROTTLE } from '@appshore/platform/shared/http/edge-throttle';
import { BearerChallengeFilter } from '@appshore/platform/domains/oauth-provider/bearer-challenge.filter';
import { AgentRateLimitGuard } from './guards/agent-rate-limit.guard';
import { OAuthTokenGuard } from '@appshore/platform/domains/oauth-provider/oauth-token.guard';
import { McpServerService } from './mcp-server.service';
import type { OAuthUser } from '@appshore/platform/domains/oauth-provider/oauth-token.guard';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

/**
 * Root-level MCP controller — handles requests at `/` (no api/v1 prefix).
 *
 * Claude.ai strips the path from the connector URL for OAuth discovery,
 * then sends MCP requests (POST/GET/DELETE) to the domain root after auth.
 * This controller mirrors McpServerController but is excluded from the
 * global prefix so it responds at `/` directly.
 */
@ApiTags('MCP')
@Controller('/')
@UseFilters(BearerChallengeFilter)
// The agent budget (AgentRateLimitGuard: per client, per key, per workspace) is the effective limit here. The edge
// throttle only caps floods, so it sits above every agent budget.
@Throttle(GENEROUS_THROTTLE)
export class McpRootController {
  constructor(private readonly mcpService: McpServerService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'MCP Streamable HTTP endpoint at the domain root (OAuth bearer), for connectors that strip the path',
  })
  @Public()
  @UseGuards(OAuthTokenGuard, AgentRateLimitGuard)
  async handleMcpRequest(@Req() req: Request, @Res() res: Response) {
    const oauthUser = (req as any).oauthUser as OAuthUser;
    await this.mcpService.handleRequest(req, res, oauthUser);
  }

  @Get()
  @ApiOperation({ summary: 'MCP SSE stream at the domain root (not supported — stateless mode; always 405)' })
  @Public()
  // eslint-disable-next-line @typescript-eslint/require-await -- satisfies async controller contract
  async handleSseStream(): Promise<never> {
    throw new HttpException(
      'This server operates in stateless mode and does not support SSE streams',
      HttpStatus.METHOD_NOT_ALLOWED,
    );
  }

  @Delete()
  @ApiOperation({ summary: 'Terminate an MCP session at the domain root (stateless: always answers ok)' })
  @Public()
  @UseGuards(OAuthTokenGuard, AgentRateLimitGuard)
  @HttpCode(HttpStatus.OK)
  // eslint-disable-next-line @typescript-eslint/require-await -- satisfies async controller contract
  async terminateSession(@Res() res: Response) {
    res.json({ status: 'ok' });
  }
}
