import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@appshore/db';
import type { OutboundAllowEntry, OutboundStatus, OutboundSuppressionList } from '@app/shared-types';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ApiResult } from '../../shared/openapi/api-result';
import { OutboundAdminService } from './outbound-admin.service';
import { CreateOutboundAllowEntryDto } from './dto/create-outbound-allow-entry.dto';
import { ListOutboundSuppressionsQueryDto } from './dto/list-outbound-suppressions.query.dto';
import {
  OutboundAllowEntryResponse,
  OutboundStatusResponse,
  OutboundSuppressionListResponse,
} from './openapi.responses';

const ENTRY_ID_PARAM = { name: 'entry_id', description: 'The allow-list entry id (uuid)' };

/**
 * Super-admin Outbound (ADR "Outbound gate"): who this environment may email, text, push or call back.
 *
 *   GET    /super-admin/outbound/status                 → live or allowlist, and the environment
 *   GET    /super-admin/outbound/allow-list             → every allow-list entry (capped)
 *   POST   /super-admin/outbound/allow-list             → add an email, email domain, phone or host
 *   DELETE /super-admin/outbound/allow-list/:entry_id   → remove one
 *   GET    /super-admin/outbound/held-back              → sends held back with no ledger row, newest first
 *
 * Pipeline sends that were held back are in the delivery ledger as SKIPPED with reason GATED.
 */
@ApiTags('Outbound (Super Admin)')
@ApiBearerAuth()
@Controller('super-admin/outbound')
@Roles(UserRole.SUPER_ADMIN)
export class OutboundAdminController {
  constructor(private readonly service: OutboundAdminService) {}

  @Get('status')
  @ApiOperation({ summary: 'The outbound mode of this environment (live or allowlist)' })
  @ApiResult(OutboundStatusResponse)
  getStatus(): OutboundStatus {
    return this.service.getStatus();
  }

  @Get('allow-list')
  @ApiOperation({ summary: 'Allow-listed recipients, by kind then value' })
  @ApiResult([OutboundAllowEntryResponse])
  listEntries(): Promise<OutboundAllowEntry[]> {
    return this.service.listEntries();
  }

  @Post('allow-list')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add an email, email domain, phone number or web host to the allow-list' })
  @ApiResult(OutboundAllowEntryResponse, HttpStatus.CREATED)
  createEntry(
    @Body() dto: CreateOutboundAllowEntryDto,
    @CurrentUser() user: { dbId: number },
  ): Promise<OutboundAllowEntry> {
    return this.service.createEntry(dto, user.dbId);
  }

  @Delete('allow-list/:entry_id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove an allow-list entry' })
  @ApiParam(ENTRY_ID_PARAM)
  @ApiNoContentResponse({ description: 'Entry removed; sends to it are held back from now on' })
  async deleteEntry(@Param('entry_id', ParseUUIDPipe) entryId: string): Promise<void> {
    await this.service.deleteEntry(entryId);
  }

  @Get('held-back')
  @ApiOperation({ summary: 'Sends the outbound gate held back, newest first (cursor-paged)' })
  @ApiResult(OutboundSuppressionListResponse)
  listSuppressions(@Query() query: ListOutboundSuppressionsQueryDto): Promise<OutboundSuppressionList> {
    return this.service.listSuppressions(query);
  }
}
