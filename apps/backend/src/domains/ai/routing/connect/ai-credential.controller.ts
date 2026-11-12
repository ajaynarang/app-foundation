import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@appshore/db';
import type { EventActor } from '@appshore/kernel/infrastructure/events/domain-event';
import { CurrentUser } from '@appshore/platform/auth/decorators/current-user.decorator';
import { Roles } from '@appshore/platform/auth/decorators/roles.decorator';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { BaseTenantController } from '@appshore/platform/shared/base/base-tenant.controller';
import { ApiResult } from '@appshore/platform/shared/openapi/api-result';

import { AiCredentialConnectResultResponse, AiSettingsResponse } from '../../openapi.responses';
import { AiCredentialConnectService } from './ai-credential-connect.service';
import { ConnectKeyDto } from './dto/connect-key.dto';
import { UpdateAiPolicyDto } from './dto/update-policy.dto';

const CREDENTIAL_ID = { name: 'credential_id', description: 'AI credential public id (aicred_…)' };

/**
 * The workspace's AI settings: its retention policy and its own AI keys (bring-your-own-key). The OWNER manages them;
 * an ADMIN reads them. A secret goes one way: in through connect, never out.
 */
@ApiTags('AI Settings')
@ApiBearerAuth()
@Controller('ai-settings')
export class AiCredentialController extends BaseTenantController {
  constructor(
    prisma: PrismaService,
    private readonly connect: AiCredentialConnectService,
  ) {
    super(prisma);
  }

  @Get()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'The retention policy, who pays for each AI need, and the workspace AI key cards' })
  @ApiResult(AiSettingsResponse)
  async getSettings(@CurrentUser() user: any) {
    return this.connect.getSettings(await this.getTenantDbId(user));
  }

  @Patch('policy')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Require or drop zero data retention (keys it rules out are kept, unused)' })
  @ApiResult(AiSettingsResponse)
  async updatePolicy(@CurrentUser() user: any, @Body() dto: UpdateAiPolicyDto) {
    return this.connect.updatePolicy(await this.getTenantDbId(user), dto.policy, await this.actor(user));
  }

  @Post('credentials')
  @Roles(UserRole.OWNER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Connect a provider key: it is tested with one small call, then stored encrypted' })
  @ApiResult(AiCredentialConnectResultResponse, HttpStatus.CREATED)
  async connectKey(@CurrentUser() user: any, @Body() dto: ConnectKeyDto) {
    const userDbId = await this.getUserDbId(user.userId);
    return this.connect.connectKey(await this.getTenantDbId(user), dto, userActor(userDbId), userDbId);
  }

  @Post('credentials/:credential_id/validate')
  @Roles(UserRole.OWNER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Test a workspace AI key again (it may turn Active or Failing)' })
  @ApiParam(CREDENTIAL_ID)
  @ApiResult(AiCredentialConnectResultResponse)
  async validate(@CurrentUser() user: any, @Param('credential_id') credentialId: string) {
    return this.connect.validate(await this.getTenantDbId(user), credentialId, await this.actor(user));
  }

  @Delete('credentials/:credential_id')
  @Roles(UserRole.OWNER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a workspace AI key' })
  @ApiParam(CREDENTIAL_ID)
  @ApiNoContentResponse({ description: 'The key is removed' })
  async remove(@CurrentUser() user: any, @Param('credential_id') credentialId: string): Promise<void> {
    await this.connect.remove(await this.getTenantDbId(user), credentialId, await this.actor(user));
  }

  private async actor(user: any): Promise<EventActor> {
    return userActor(await this.getUserDbId(user.userId));
  }
}

function userActor(userDbId: number): EventActor {
  return { id: String(userDbId), type: 'user' };
}
