import { Controller, Get, Post, Delete, Req, Res, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { Public } from '@appshore/platform/auth/decorators/public.decorator';
import { SkipThrottle } from '@nestjs/throttler';
import { OAuthTokenGuard } from '@appshore/platform/domains/platform/oauth-provider/oauth-token.guard';
import { McpServerService } from './mcp-server.service';
import type { OAuthUser } from '@appshore/platform/domains/platform/oauth-provider/oauth-token.guard';

/**
 * Root-level MCP controller — handles requests at `/` (no api/v1 prefix).
 *
 * Claude.ai strips the path from the connector URL for OAuth discovery,
 * then sends MCP requests (POST/GET/DELETE) to the domain root after auth.
 * This controller mirrors McpServerController but is excluded from the
 * global prefix so it responds at `/` directly.
 */
@Controller('/')
export class McpRootController {
  constructor(private readonly mcpService: McpServerService) {}

  @Post()
  @Public()
  @UseGuards(OAuthTokenGuard)
  @SkipThrottle()
  async handleMcpRequest(@Req() req: Request, @Res() res: Response) {
    const oauthUser = (req as any).oauthUser as OAuthUser;
    await this.mcpService.handleRequest(req, res, oauthUser);
  }

  @Get()
  @Public()
  @SkipThrottle()
  // eslint-disable-next-line @typescript-eslint/require-await -- satisfies async controller contract
  async handleSseStream(@Res() res: Response) {
    res.status(HttpStatus.METHOD_NOT_ALLOWED).json({
      error: 'Method Not Allowed',
      message: 'This server operates in stateless mode and does not support SSE streams',
    });
  }

  @Delete()
  @Public()
  @UseGuards(OAuthTokenGuard)
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  // eslint-disable-next-line @typescript-eslint/require-await -- satisfies async controller contract
  async terminateSession(@Res() res: Response) {
    res.json({ status: 'ok' });
  }
}
