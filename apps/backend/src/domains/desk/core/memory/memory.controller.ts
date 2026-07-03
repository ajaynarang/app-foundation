import {
  BadRequestException,
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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@appshore/db';
import { ListMemoriesQuerySchema } from '../types';

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
  async list(
    @CurrentUser() user: any,
    @Query('agentKey') agentKey?: string,
    @Query('scope') scope?: string,
    @Query('polarity') polarity?: string,
    @Query('authoredByOperatorOnly') authoredByOperatorOnly?: string,
    @Query('sourceEpisodeId') sourceEpisodeId?: string,
    @Query('activeOnly') activeOnly?: string,
    @Query('limit') limit?: string,
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    const parsed = ListMemoriesQuerySchema.parse({
      agentKey,
      scope,
      polarity,
      authoredByOperatorOnly,
      sourceEpisodeId,
      activeOnly,
      limit,
    });
    const rows = await this.memories.listForUI({
      tenantId: tenantDbId,
      agentKey: parsed.agentKey,
      scope: parsed.scope,
      polarity: parsed.polarity,
      authoredByOperatorOnly: parsed.authoredByOperatorOnly,
      sourceEpisodeId: parsed.sourceEpisodeId,
      activeOnly: parsed.activeOnly,
      limit: parsed.limit,
    });
    return { rows };
  }

  @Patch(':id')
  @UseGuards(DeskAgentEditGuard)
  @ApiOperation({ summary: 'Edit a memory (content + isActive)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
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
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
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
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async remove(@CurrentUser() user: any, @Param('id', new ParseUUIDPipe()) id: string) {
    const tenantDbId = await this.getTenantDbId(user);
    await this.memories.softDelete(id, tenantDbId);
  }

  @Post('playbook')
  @UseGuards(DeskAgentEditGuard)
  @ApiOperation({ summary: 'Add an operator-authored playbook rule (Rules tab "Add a rule")' })
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
      // Should never happen — JwtAuthGuard always sets dbId — but throw a
      // user-friendly error rather than persisting a NULL author and
      // disguising an operator-authored rule as LLM-extracted.
      throw new BadRequestException('Cannot identify rule author');
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
