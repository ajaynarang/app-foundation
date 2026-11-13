import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@appshore/db';

import { CurrentUser } from '@appshore/platform/auth/decorators/current-user.decorator';
import { Roles } from '@appshore/platform/auth/decorators/roles.decorator';
import { BaseTenantController } from '@appshore/platform/shared/base/base-tenant.controller';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';

import { DeskAgentEditGuard } from '../agent/desk-agent-edit.guard';

import { DeskMemoryService } from './desk-memory.service';
import { DeskMemoryWriterService } from './desk-memory-writer.service';
import { AddPlaybookRuleDto } from './dto/add-playbook-rule.dto';
import { SetMemoryPinnedDto } from './dto/set-pinned.dto';
import { UpdateMemoryDto } from './dto/update-memory.dto';
import { MemoryListQueryDto } from './dto/memory-list-query.dto';
import { ApiResult } from '@appshore/platform/shared/openapi/api-result';
import { DeskMemoryListResponse, DeskMemoryPinnedResponse, DeskMemoryRefResponse } from '../../openapi.responses';
import { RequireFeature } from '@appshore/platform/auth/decorators/require-feature.decorator';
import { FEATURE_KEYS } from '@app/shared-types';

/**
 * HTTP surface for the Crew → Agent sheet.
 *
 *   GET    /desk/memories                — list (Memory tab + Rules tab)
 *   PATCH  /desk/memories/:id            — edit content/isActive (operator-authored only by convention)
 *   PATCH  /desk/memories/:id/pinned     — pin/unpin
 *   DELETE /desk/memories/:id            — soft-delete
 *   POST   /desk/memories/playbook       — operator-authored "Add a rule" (Rules tab) — wired in T5
 */
@ApiTags('Desk — Memory')
@ApiBearerAuth()
@RequireFeature(FEATURE_KEYS.DESK)
@Controller('desk/memories')
@Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER, UserRole.SUPER_ADMIN)
export class DeskMemoryController extends BaseTenantController {
  constructor(
    prisma: PrismaService,
    private readonly memories: DeskMemoryService,
    private readonly writer: DeskMemoryWriterService,
  ) {
    super(prisma);
  }

  @Get()
  @ApiOperation({ summary: 'List memories (Memory tab and Rules tab use the same endpoint with different filters)' })
  @ApiResult(DeskMemoryListResponse)
  async list(@CurrentUser() user: any, @Query() query: MemoryListQueryDto) {
    const tenantDbId = await this.getTenantDbId(user);
    const rows = await this.memories.listForUI({
      tenantId: tenantDbId,
      agentKey: query.agentKey,
      scope: query.scope,
      polarity: query.polarity,
      authoredByOperatorOnly: query.authoredByOperatorOnly,
      sourceEpisodeId: query.sourceEpisodeId,
      activeOnly: query.activeOnly,
      limit: query.limit,
    });
    return { rows };
  }

  @Patch(':id')
  @UseGuards(DeskAgentEditGuard)
  @ApiOperation({ summary: 'Edit a memory (content + isActive)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Memory id (uuid)' })
  @ApiResult(DeskMemoryRefResponse)
  async update(@CurrentUser() user: any, @Param('id', new ParseUUIDPipe()) id: string, @Body() body: UpdateMemoryDto) {
    const tenantDbId = await this.getTenantDbId(user);
    await this.memories.updateForTenant({
      tenantId: tenantDbId,
      memoryId: id,
      content: body.content,
      isActive: body.isActive,
    });
    return { id };
  }

  @Patch(':id/pinned')
  @UseGuards(DeskAgentEditGuard)
  @ApiOperation({ summary: 'Pin or unpin a memory (pinned memories are exempt from auto-decay)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Memory id (uuid)' })
  @ApiResult(DeskMemoryPinnedResponse)
  async setPinned(
    @CurrentUser() user: any,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: SetMemoryPinnedDto,
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    await this.memories.setPinned({ memoryId: id, tenantId: tenantDbId, isPinned: body.isPinned });
    return { id, isPinned: body.isPinned };
  }

  @Delete(':id')
  @UseGuards(DeskAgentEditGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a memory (prune what the assistant learned or what the operator wrote)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Memory id (uuid)' })
  @ApiNoContentResponse({ description: 'The memory is soft-deleted' })
  async remove(@CurrentUser() user: any, @Param('id', new ParseUUIDPipe()) id: string) {
    const tenantDbId = await this.getTenantDbId(user);
    await this.memories.softDelete(id, tenantDbId);
  }

  @Post('playbook')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(DeskAgentEditGuard)
  @ApiOperation({ summary: 'Add an operator-authored playbook rule (Rules tab "Add a rule")' })
  @ApiResult(DeskMemoryRefResponse, HttpStatus.CREATED)
  async addPlaybookRule(@CurrentUser() user: any, @Body() body: AddPlaybookRuleDto) {
    const tenantDbId = await this.getTenantDbId(user);
    const agent = await this.prisma.deskAgent.findFirst({
      where: { tenantId: tenantDbId, key: body.agentKey },
      select: { id: true },
    });
    if (!agent) {
      throw new NotFoundException(`Agent '${body.agentKey}' not found in this tenant`);
    }
    const authoredByUserId = user?.dbId;
    if (typeof authoredByUserId !== 'number') {
      // Should never happen: JwtAuthGuard always sets dbId. No field of the request is at fault, the session
      // is: a 401, never a NULL author that would disguise an operator's rule as one the model extracted.
      throw new UnauthorizedException('Sign in again to add a rule');
    }
    const created = await this.writer.writeOperatorRule({
      tenantId: tenantDbId,
      agentId: agent.id,
      authoredByUserId,
      content: body.content,
    });
    return { id: created.id };
  }
}
