import { Body, Controller, Get, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { IsString, MinLength } from 'class-validator';
import { ConfigService } from '@nestjs/config';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { WorkspacesService } from './workspaces.service';
import {
  REFRESH_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_PATH,
  REFRESH_TOKEN_COOKIE_MAX_AGE_MS,
} from '../../constants/auth.constants';

class SwitchWorkspaceDto {
  @IsString()
  @MinLength(1)
  tenantId: string;
}

@ApiTags('Workspaces')
@ApiBearerAuth()
@Controller('workspaces')
export class WorkspacesController {
  constructor(
    private readonly workspacesService: WorkspacesService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  @ApiOperation({ summary: "List the current user's workspaces (memberships)" })
  async list(@CurrentUser() user: any) {
    return { workspaces: await this.workspacesService.listForUser(user.dbId) };
  }

  @Post('switch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Switch the session to another workspace (reissues tokens)' })
  async switch(
    @CurrentUser() user: any,
    @Body() dto: SwitchWorkspaceDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.workspacesService.switch(user.dbId, dto.tenantId);
    // Same cookie contract as login (auth.controller setRefreshTokenCookie)
    const cookieDomain = this.configService.get<string>('COOKIE_DOMAIN');
    response.cookie(REFRESH_TOKEN_COOKIE_NAME, result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: REFRESH_TOKEN_COOKIE_PATH,
      maxAge: REFRESH_TOKEN_COOKIE_MAX_AGE_MS,
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    });
    return { accessToken: result.accessToken, workspace: result.workspace };
  }
}
