import { Controller, Get, Post, Param, ParseIntPipe, Query, Body, Logger, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { RequireFeature } from '../../../../auth/decorators/require-feature.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { EmailIntakeService } from '../services/email-intake.service';
import { LoadsService } from '../../../fleet/loads/services/loads.service';
import { ListEmailThreadsDto } from '../dto/list-email-threads.dto';
import { ConfirmEmailLoadDto } from '../dto/confirm-email-load.dto';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { DOMAIN_EVENTS } from '../../../../infrastructure/events/sally-events.constants';

@ApiTags('Email Intake')
@Controller('integrations/email-intake')
@RequireFeature('email_intake')
export class EmailIntakeController {
  private readonly logger = new Logger(EmailIntakeController.name);

  constructor(
    private readonly emailIntakeService: EmailIntakeService,
    private readonly loadsService: LoadsService,
    private readonly events: DomainEventService,
  ) {}

  @Get('threads')
  @ApiOperation({ summary: 'List email intake threads' })
  async listThreads(@CurrentUser() user: any, @Query() params: ListEmailThreadsDto) {
    return this.emailIntakeService.listThreads(user.tenantDbId, params);
  }

  @Get('threads/:id')
  @ApiOperation({ summary: 'Get email intake thread detail' })
  async getThread(@CurrentUser() user: any, @Param('id', ParseIntPipe) threadId: number) {
    return this.emailIntakeService.getThread(user.tenantDbId, threadId);
  }

  @Post('threads/:id/confirm')
  @ApiOperation({ summary: 'Confirm thread and create load from parsed data' })
  async confirmThread(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) threadId: number,
    @Body() dto: ConfirmEmailLoadDto,
  ) {
    const tenantId = user.tenantDbId as number;

    // Get the thread to find the latest parsed attachment
    const thread = await this.emailIntakeService.getThread(tenantId, threadId);

    // Find the attachment to use — either from DTO or latest parsed
    let attachment: any;
    if (dto.attachmentId) {
      attachment = await this.emailIntakeService.getAttachment(tenantId, dto.attachmentId);
    } else {
      // Find the latest parsed attachment in the thread
      for (const msg of thread.messages) {
        for (const att of msg.attachments) {
          if (att.isLatestVersion && att.parseStatus === 'PARSED' && att.parsedData) {
            attachment = att;
            break;
          }
        }
        if (attachment) break;
      }
    }

    if (!attachment || !attachment.parsedData) {
      throw new BadRequestException('No parsed attachment available for this thread');
    }

    const parsedData = attachment.parsedData as Record<string, any>;

    // Build stops from parsed data or overrides
    const stops =
      dto.stops ||
      (parsedData.stops || []).map((s: any, i: number) => ({
        stopId: `STOP-EMAIL-${Date.now()}-${i}`,
        sequenceOrder: s.sequence,
        actionType: s.action_type,
        appointmentDate: s.appointment_date || undefined,
        earliestArrival: s.appointment_time || undefined,
        estimatedDockHours: 2,
        name: s.facility_name,
        address: s.address || '',
        city: s.city || '',
        state: s.state || '',
        zipCode: s.zip_code || '',
      }));

    // Find or create customer by MC# or broker name (same as ratecon processor)
    let customerId = dto.customerId;
    const brokerName = dto.customerName ?? parsedData.broker_name;
    const brokerMc = parsedData.broker_mc;

    if (!customerId && brokerName) {
      // Try MC# match first
      if (brokerMc) {
        const byMc = await this.emailIntakeService.findCustomerByMc(tenantId, brokerMc);
        if (byMc) customerId = byMc;
      }
      // Then try name match
      if (!customerId) {
        const byName = await this.emailIntakeService.findCustomerByName(tenantId, brokerName);
        if (byName) customerId = byName;
      }
    }

    // Create load via LoadsService
    const load = await this.loadsService.create({
      tenantId,
      status: 'DRAFT',
      weightLbs: dto.weightLbs ?? parsedData.weight_lbs ?? 0,
      commodityType: dto.commodityType ?? parsedData.commodity ?? 'General Freight',
      specialRequirements: parsedData.special_instructions || undefined,
      customerName: brokerName ?? 'Unknown Customer',
      customerId,
      equipmentType: parsedData.equipment_type ?? undefined,
      referenceNumber: dto.referenceNumber ?? parsedData.load_number ?? undefined,
      rateCents: dto.rateCents ?? (parsedData.rate_total_usd ? Math.round(parsedData.rate_total_usd * 100) : undefined),
      intakeSource: 'email',
      intakeMetadata: {
        threadId,
        attachmentId: attachment.id,
        senderEmail: thread.senderEmail,
        subject: thread.subject,
        parsedAt: new Date().toISOString(),
        brokerName: parsedData.broker_name,
        originalLoadNumber: parsedData.load_number,
      },
      stops,
    });

    // Mark thread as confirmed and link load
    await this.emailIntakeService.confirmThread(tenantId, threadId, user.dbId);
    await this.emailIntakeService.linkLoadToThread(threadId, load.loadNumber);

    // Emit confirmed event
    await this.events.emit(DOMAIN_EVENTS.EMAIL_INGEST_CONFIRMED, tenantId, {
      entityId: String(threadId),
      entityType: 'email-ingest',
      threadId,
      loadNumber: load.loadNumber,
    });

    this.logger.log(`Thread ${threadId} confirmed: created load ${load.loadNumber} (tenant ${tenantId})`);

    return { loadNumber: load.loadNumber };
  }

  @Post('threads/:id/discard')
  @ApiOperation({ summary: 'Discard email intake thread' })
  async discardThread(@CurrentUser() user: any, @Param('id', ParseIntPipe) threadId: number) {
    await this.emailIntakeService.discardThread(user.tenantDbId, threadId);
    return { status: 'discarded' };
  }

  @Post('threads/:id/restore')
  @ApiOperation({ summary: 'Restore a discarded email intake thread' })
  async restoreThread(@CurrentUser() user: any, @Param('id', ParseIntPipe) threadId: number) {
    await this.emailIntakeService.restoreThread(user.tenantDbId, threadId);
    return { status: 'restored' };
  }

  @Post('threads/:id/approve-sender')
  @ApiOperation({ summary: 'Approve sender domain and parse held attachments' })
  async approveSenderAndParse(@CurrentUser() user: any, @Param('id', ParseIntPipe) threadId: number) {
    return this.emailIntakeService.approveSenderAndParse(user.tenantDbId, threadId);
  }

  @Post('attachments/:id/reparse')
  @ApiOperation({ summary: 'Requeue attachment for re-parsing' })
  async reparseAttachment(@CurrentUser() user: any, @Param('id', ParseIntPipe) attachmentId: number) {
    return this.emailIntakeService.requeueAttachment(user.tenantDbId, attachmentId);
  }
}
