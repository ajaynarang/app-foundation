import { Injectable } from '@nestjs/common';
import type {
  CommandCenterOverviewDto,
  ShiftNoteDto,
  SystemHealthDto,
  MessageSummaryResponseDto,
} from './command-center.types';
import type { CommandCenterMapDataDto } from './dto/map-data.dto';
import { OverviewService } from './services/overview.service';
import { MapDataService } from './services/map-data.service';
import { MessageSummaryService } from './services/message-summary.service';
import { ShiftNotesService } from './services/shift-notes.service';
import { SystemHealthService } from './services/system-health.service';

@Injectable()
export class CommandCenterService {
  constructor(
    private readonly overviewService: OverviewService,
    private readonly mapDataService: MapDataService,
    private readonly messageSummaryService: MessageSummaryService,
    private readonly shiftNotesService: ShiftNotesService,
    private readonly systemHealthService: SystemHealthService,
  ) {}

  // ---------------------------------------------------------------------------
  // Overview (aggregated endpoint)
  // ---------------------------------------------------------------------------

  async getOverview(tenantId: number): Promise<CommandCenterOverviewDto> {
    return this.overviewService.getOverview(tenantId);
  }

  // ---------------------------------------------------------------------------
  // Map Data (vehicle locations + unassigned loads)
  // ---------------------------------------------------------------------------

  async getMapData(tenantId: number): Promise<CommandCenterMapDataDto> {
    return this.mapDataService.getMapData(tenantId);
  }

  // ---------------------------------------------------------------------------
  // Message Summary (messaging hub)
  // ---------------------------------------------------------------------------

  async getMessageSummary(tenantId: number): Promise<MessageSummaryResponseDto> {
    return this.messageSummaryService.getMessageSummary(tenantId);
  }

  // ---------------------------------------------------------------------------
  // Shift Notes (real data, backed by Prisma)
  // ---------------------------------------------------------------------------

  async getShiftNotes(tenantId: number): Promise<{ notes: ShiftNoteDto[]; handoffStatus: any }> {
    return this.shiftNotesService.getShiftNotes(tenantId);
  }

  async createShiftNote(
    tenantId: number,
    userStringId: string,
    content: string,
    isPinned: boolean = false,
    priority: string = 'info',
  ): Promise<ShiftNoteDto> {
    return this.shiftNotesService.createShiftNote(tenantId, userStringId, content, isPinned, priority);
  }

  async togglePinShiftNote(tenantId: number, noteId: string): Promise<ShiftNoteDto> {
    return this.shiftNotesService.togglePinShiftNote(tenantId, noteId);
  }

  async deleteShiftNote(tenantId: number, noteId: string): Promise<void> {
    return this.shiftNotesService.deleteShiftNote(tenantId, noteId);
  }

  async acknowledgeHandoff(tenantId: number, userStringId: string): Promise<void> {
    return this.shiftNotesService.acknowledgeHandoff(tenantId, userStringId);
  }

  // ---------------------------------------------------------------------------
  // System Health
  // ---------------------------------------------------------------------------

  async getSystemHealth(tenantId: number): Promise<SystemHealthDto> {
    return this.systemHealthService.getSystemHealth(tenantId);
  }
}
