import { Injectable, Inject, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';
import { DomainEvent } from '../../../../infrastructure/events/domain-event';
import { EDIMessageService } from '../services/edi-message.service';
import { EDI_ADAPTER, IEDIAdapter } from '../adapters/edi-adapter.interface';

const STATUS_TO_214_CODE: Record<string, string> = {
  ASSIGNED: 'AF',
  IN_TRANSIT: 'AG',
  DELIVERED: 'D1',
  ON_HOLD: 'OA',
};

const STOP_STATUS_TO_214_CODE: Record<string, string> = {
  arrived: 'X3',
  loading: 'X1',
  completed: 'X4',
  departed: 'AF',
};

@Injectable()
export class EDITrackingSubscriber {
  private readonly logger = new Logger(EDITrackingSubscriber.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messageService: EDIMessageService,
    @Inject(EDI_ADAPTER) private readonly adapter: IEDIAdapter,
    private readonly events: DomainEventService,
  ) {}

  @OnEvent(SALLY_EVENTS.LOAD_STATUS_CHANGED, { async: true })
  async onLoadStatusChanged(
    event: DomainEvent<{
      loadId: number;
      loadNumber: string;
      status: string;
      previousStatus?: string;
    }>,
  ) {
    try {
      const statusCode = STATUS_TO_214_CODE[event.data.status];
      if (!statusCode) return;
      await this.send214(event.data.loadId, statusCode, `Load status: ${event.data.status}`);
    } catch (error: any) {
      this.logger.error(`Failed to send T214 for load ${event.data.loadId}: ${error.message}`, error.stack);
    }
  }

  @OnEvent(SALLY_EVENTS.LOAD_STOP_STATUS_CHANGED, { async: true })
  async onStopStatusChanged(
    event: DomainEvent<{
      loadId: number;
      loadNumber: string;
      stopId: number;
      status: string;
    }>,
  ) {
    try {
      const statusCode = STOP_STATUS_TO_214_CODE[event.data.status];
      if (!statusCode) return;
      await this.send214(event.data.loadId, statusCode, `Stop status: ${event.data.status}`, event.data.stopId);
    } catch (error: any) {
      this.logger.error(
        `Failed to send T214 for load ${event.data.loadId} stop ${event.data.stopId}: ${error.message}`,
        error.stack,
      );
    }
  }

  private async send214(loadId: number, statusCode: string, description: string, stopId?: number) {
    const load = await this.prisma.load.findUnique({
      where: { id: loadId },
      include: { ediTenderMessage: { include: { tradingPartner: true } } },
    });

    if (!load || load.intakeSource !== 'edi') return;
    if (!load.ediTenderMessage?.tradingPartner) return;

    const partner = load.ediTenderMessage.tradingPartner;
    const brokerRef = (load.intakeMetadata as any)?.brokerReference;

    const statusData = {
      shipmentReference: brokerRef,
      statusCode,
      statusDescription: description,
      timestamp: new Date().toISOString(),
      stopSequence: stopId,
    };

    const message = await this.messageService.logMessage({
      tenantId: load.tenantId,
      tradingPartnerId: partner.id,
      direction: 'OUTBOUND',
      messageType: 'T214',
      referenceNumber: brokerRef,
      parsedData: statusData,
      loadId,
    });

    const result = await this.adapter.sendStatusUpdate(partner.vanConfig as any, statusData);

    if (result.success) {
      await this.messageService.updateStatus(message.id, 'SENT');
      await this.events.emit(SALLY_EVENTS.EDI_MESSAGE_SENT, load.tenantId, {
        entityId: String(message.id),
        entityType: 'edi-message',
        messageId: message.id,
        messageType: 'T214',
      });
    } else {
      await this.messageService.updateStatus(message.id, 'FAILED', result.errorMessage);
      await this.events.emit(SALLY_EVENTS.EDI_MESSAGE_FAILED, load.tenantId, {
        entityId: String(message.id),
        entityType: 'edi-message',
        messageId: message.id,
        messageType: 'T214',
        error: result.errorMessage,
      });
    }
  }
}
