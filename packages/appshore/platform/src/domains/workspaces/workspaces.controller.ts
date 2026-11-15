import { Body, Controller, Get, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { IsString, MinLength } from 'class-validator';
import { ConfigService } from '@nestjs/config';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { WorkspacesService } from './workspaces.service';
import { setRefreshTokenCookie } from '../../auth/refresh-token-cookie';

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
    // Same host-only cookie as login.
    setRefreshTokenCookie(response, result.refreshToken, {
      secure: this.configService.get<string>('environment') === 'production',
      legacyDomain: this.configService.get<string>('COOKIE_DOMAIN') || undefined,
    });
    return { accessToken: result.accessToken, workspace: result.workspace };
  }
}
