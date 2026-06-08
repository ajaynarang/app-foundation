import { Injectable, Inject, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';
import { DomainEvent } from '../../../../infrastructure/events/domain-event';
import { EDIMessageService } from '../services/edi-message.service';
import { EDI_ADAPTER, IEDIAdapter } from '../adapters/edi-adapter.interface';

@Injectable()
export class EDIInvoicingSubscriber {
  private readonly logger = new Logger(EDIInvoicingSubscriber.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messageService: EDIMessageService,
    @Inject(EDI_ADAPTER) private readonly adapter: IEDIAdapter,
    private readonly events: DomainEventService,
  ) {}

  @OnEvent(SALLY_EVENTS.INVOICE_SENT, { async: true })
  async onInvoiceSent(event: DomainEvent<{ invoiceId: number }>) {
    try {
      await this.processInvoice(event.data.invoiceId);
    } catch (error: any) {
      this.logger.error(`Failed to send T210 for invoice ${event.data.invoiceId}: ${error.message}`, error.stack);
    }
  }

  private async processInvoice(invoiceId: number) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        load: {
          include: { ediTenderMessage: { include: { tradingPartner: true } } },
        },
        lineItems: true,
      },
    });

    if (!invoice?.load || invoice.load.intakeSource !== 'edi') return;
    if (!invoice.load.ediTenderMessage?.tradingPartner) return;

    const partner = invoice.load.ediTenderMessage.tradingPartner;
    const brokerRef = (invoice.load.intakeMetadata as any)?.brokerReference;

    const invoiceData = {
      shipmentReference: brokerRef,
      invoiceNumber: invoice.invoiceNumber,
      totalAmountCents: invoice.totalCents,
      lineItems: invoice.lineItems.map((li) => ({
        type: li.type,
        description: li.description,
        quantity: li.quantity,
        unitPriceCents: li.unitPriceCents,
        totalCents: li.totalCents,
      })),
    };

    const message = await this.messageService.logMessage({
      tenantId: invoice.tenantId,
      tradingPartnerId: partner.id,
      direction: 'OUTBOUND',
      messageType: 'T210',
      referenceNumber: invoice.invoiceNumber,
      parsedData: invoiceData,
      loadId: invoice.loadId,
      invoiceId: invoice.id,
    });

    const result = await this.adapter.sendInvoice(partner.vanConfig as any, invoiceData);

    if (result.success) {
      await this.messageService.updateStatus(message.id, 'SENT');
      await this.events.emit(SALLY_EVENTS.EDI_MESSAGE_SENT, invoice.tenantId, {
        messageId: message.id,
        messageType: 'T210',
      });
    } else {
      await this.messageService.updateStatus(message.id, 'FAILED', result.errorMessage);
      await this.events.emit(SALLY_EVENTS.EDI_MESSAGE_FAILED, invoice.tenantId, {
        messageId: message.id,
        messageType: 'T210',
        error: result.errorMessage,
      });
    }
  }
}
