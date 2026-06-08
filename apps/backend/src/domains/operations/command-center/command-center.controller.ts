import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { RequireFeature } from '../../../auth/decorators/require-feature.decorator';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { CommandCenterService } from './command-center.service';
import { CreateShiftNoteDto } from './dto/create-shift-note.dto';
import { ActiveLoadsQueryDto } from './dto/active-loads-query.dto';
import { WireQueryDto } from './dto/wire-query.dto';
import { ActiveLoadsService } from './services/active-loads.service';
import { RiskScoreService } from './services/risk-score.service';
import { TowerWireService } from './services/tower-wire.service';

@ApiTags('Command Center')
@Controller('command-center')
@RequireFeature('command_center')
@Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
export class CommandCenterController {
  constructor(
    private readonly service: CommandCenterService,
    private readonly activeLoadsService: ActiveLoadsService,
    private readonly riskScoreService: RiskScoreService,
    private readonly towerWireService: TowerWireService,
  ) {}

  @Get('map-data')
  @ApiOperation({
    summary: 'Get map data (vehicle locations, driver HOS, unassigned loads)',
  })
  async getMapData(@CurrentUser() user: any) {
    return this.service.getMapData(user.tenantDbId);
  }

  @Get('overview')
  @ApiOperation({
    summary: 'Get command center overview (KPIs, active loads, HOS strip)',
  })
  async getOverview(@CurrentUser() user: any) {
    return this.service.getOverview(user.tenantDbId);
  }

  @Get('message-summary')
  @ApiOperation({
    summary: 'Get active load message summary for command center',
  })
  async getMessageSummary(@CurrentUser() user: any) {
    return this.service.getMessageSummary(user.tenantDbId);
  }

  @Get('system-health')
  @ApiOperation({
    summary: 'Get monitoring system health (checks, integrations, status)',
  })
  async getSystemHealth(@CurrentUser() user: any) {
    return this.service.getSystemHealth(user.tenantDbId);
  }

  @Get('shift-notes')
  @ApiOperation({ summary: 'Get shift notes for current tenant' })
  async getShiftNotes(@CurrentUser() user: any) {
    return this.service.getShiftNotes(user.tenantDbId);
  }

  @Post('shift-notes')
  @ApiOperation({ summary: 'Create a new shift note' })
  async createShiftNote(@CurrentUser() user: any, @Body() dto: CreateShiftNoteDto) {
    return this.service.createShiftNote(user.tenantDbId, user.userId, dto.content, dto.isPinned, dto.priority);
  }

  @Patch('shift-notes/acknowledge')
  @ApiOperation({ summary: 'Acknowledge shift handoff (bulk)' })
  async acknowledgeHandoff(@CurrentUser() user: any) {
    await this.service.acknowledgeHandoff(user.tenantDbId, user.userId);
    return { message: 'Handoff acknowledged' };
  }

  @Patch('shift-notes/:noteId/pin')
  @ApiOperation({ summary: 'Toggle pin on a shift note' })
  async togglePinShiftNote(@CurrentUser() user: any, @Param('noteId') noteId: string) {
    return this.service.togglePinShiftNote(user.tenantDbId, noteId);
  }

  @Delete('shift-notes/:noteId')
  @ApiOperation({ summary: 'Delete a shift note' })
  async deleteShiftNote(@CurrentUser() user: any, @Param('noteId') noteId: string) {
    await this.service.deleteShiftNote(user.tenantDbId, noteId);
    return { message: 'Note deleted' };
  }

  // ─── Tower v3 ─────────────────────────────────────────────────────────

  @Get('active-loads')
  @ApiOperation({ summary: 'Tower v3 — driver-centric active loads view' })
  async getActiveLoads(@CurrentUser() user: any, @Query() query: ActiveLoadsQueryDto) {
    return this.activeLoadsService.findActiveLoads(user.tenantDbId, query.lookaheadHours);
  }

  @Get('risk-scores')
  @ApiOperation({ summary: 'Tower v3 — per-load risk scores with hysteresis bands' })
  async getRiskScores(@CurrentUser() user: any, @Query() query: ActiveLoadsQueryDto) {
    const active = await this.activeLoadsService.findActiveLoads(user.tenantDbId, query.lookaheadHours);
    return this.riskScoreService.computeScores(user.tenantDbId, active);
  }

  @Get('wire')
  @ApiOperation({ summary: 'Tower v3 — wire backfill (alerts / messages / desk / ops)' })
  async getWire(@CurrentUser() user: any, @Query() query: WireQueryDto) {
    const since = query.since ? new Date(query.since) : new Date(Date.now() - 30 * 60_000);
    const kinds = query.kinds ?? ['alert', 'message', 'desk', 'ops'];
    return this.towerWireService.backfill(user.tenantDbId, since, kinds, query.limit);
  }
}
