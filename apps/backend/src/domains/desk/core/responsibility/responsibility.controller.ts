import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@appshore/db';

import { CurrentUser } from '@appshore/platform/auth/decorators/current-user.decorator';
import { Roles } from '@appshore/platform/auth/decorators/roles.decorator';
import { BaseTenantController } from '@appshore/platform/shared/base/base-tenant.controller';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';

import { DeskAgentEditGuard } from '../agent/desk-agent-edit.guard';
import { TriggerService } from '../trigger/trigger.service';
import { findResponsibilityDefinition } from '../../responsibilities';

import { DeskResponsibilityService } from './responsibility.service';
import { UpdateResponsibilityDto } from './dto/update-responsibility.dto';
import { UpdateResponsibilityAutonomyDto } from './dto/update-responsibility-autonomy.dto';
import { ApiResult } from '@appshore/platform/shared/openapi/api-result';
import {
  DeskResponsibilityDetailResponse,
  DeskResponsibilityListItemResponse,
  DeskResponsibilityRunResultResponse,
  DeskResponsibilityUiSpecResponse,
} from '../../openapi.responses';
import { RequireFeature } from '@appshore/platform/auth/decorators/require-feature.decorator';
import { FEATURE_KEYS } from '@app/shared-types';

/**
 * HTTP surface for the Desk index + responsibility settings page.
 * Auth: Member + Admin + Owner + SuperAdmin.
 * Tenant scoping is resolved via BaseTenantController.getTenantDbId.
 */
@ApiTags('Desk — Responsibilities')
@ApiBearerAuth()
@RequireFeature(FEATURE_KEYS.DESK)
@Controller('desk/responsibilities')
@Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER, UserRole.SUPER_ADMIN)
export class DeskResponsibilityController extends BaseTenantController {
  constructor(
    prisma: PrismaService,
    private readonly responsibilities: DeskResponsibilityService,
    private readonly triggers: TriggerService,
  ) {
    super(prisma);
  }

  @Get()
  @ApiOperation({ summary: 'List all Desk responsibilities for this tenant' })
  @ApiResult([DeskResponsibilityListItemResponse])
  async list(@CurrentUser() user: any) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.responsibilities.listForTenant(tenantDbId);
  }

  @Get(':key')
  @ApiOperation({ summary: 'Get one responsibility (config + rollups)' })
  @ApiParam({ name: 'key', type: 'string', description: 'Responsibility key (from the responsibility registry)' })
  @ApiResult(DeskResponsibilityDetailResponse)
  async get(@CurrentUser() user: any, @Param('key') key: string) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.responsibilities.getForTenant(tenantDbId, key);
  }

  @Get(':key/ui-spec')
  @ApiOperation({
    summary: 'Get the conditions UI spec + defaults for the settings form. Code-authored; same for every tenant.',
  })
  @ApiParam({ name: 'key', type: 'string', description: 'Responsibility key (from the responsibility registry)' })
  @ApiResult(DeskResponsibilityUiSpecResponse)
  uiSpec(@Param('key') key: string) {
    const def = findResponsibilityDefinition(key);
    if (!def) throw new NotFoundException(`Unknown responsibility ${key}`);
    return {
      key: def.key,
      title: def.title,
      description: def.description,
      lifecycle: def.lifecycle,
      conditionsUI: def.conditionsUI,
      defaults: def.defaults,
      triggers: def.triggers,
      tools: def.tools,
    };
  }

  @Patch(':key')
  @UseGuards(DeskAgentEditGuard)
  @ApiOperation({
    summary: 'Update per-tenant settings (enabled/trust/conditions/notes)',
  })
  @ApiParam({ name: 'key', type: 'string', description: 'Responsibility key (from the responsibility registry)' })
  @ApiResult(DeskResponsibilityDetailResponse)
  async update(@CurrentUser() user: any, @Param('key') key: string, @Body() body: UpdateResponsibilityDto) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.responsibilities.updateForTenant(tenantDbId, key, body);
  }

  @Patch(':key/autonomy')
  @UseGuards(DeskAgentEditGuard)
  @ApiOperation({
    summary: 'Toggle the per-responsibility "Run automatically" switch (governs all non-manual triggers)',
  })
  @ApiParam({ name: 'key', type: 'string', description: 'Responsibility key (from the responsibility registry)' })
  @ApiResult(DeskResponsibilityDetailResponse)
  async updateAutonomy(
    @CurrentUser() user: any,
    @Param('key') key: string,
    @Body() body: UpdateResponsibilityAutonomyDto,
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.responsibilities.setAutonomyEnabled(tenantDbId, key, body.autonomyEnabled);
  }

  @Post(':key/run')
  @UseGuards(DeskAgentEditGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Manually trigger a responsibility run (fan-out + episode open + Inngest dispatch)',
  })
  @ApiParam({ name: 'key', type: 'string', description: 'Responsibility key (from the responsibility registry)' })
  @ApiResult(DeskResponsibilityRunResultResponse, HttpStatus.ACCEPTED)
  async run(@CurrentUser() user: any, @Param('key') key: string) {
    const tenantDbId = await this.getTenantDbId(user);
    // TriggerService.runByKey centralizes the key → run-method routing
    // (shared with the scheduler heartbeat) and throws BadRequestException
    // for an unwired key.
    return this.triggers.runByKey(key, tenantDbId);
  }
}
