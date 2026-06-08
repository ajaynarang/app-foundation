import { Test, TestingModule } from '@nestjs/testing';
import { EDIInvoicingSubscriber } from '../edi-invoicing.subscriber';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { DomainEventService } from '../../../../../infrastructure/events/domain-event.service';
import { EDIMessageService } from '../../services/edi-message.service';
import { EDI_ADAPTER } from '../../adapters/edi-adapter.interface';
import { DomainEvent } from '../../../../../infrastructure/events/domain-event';
import { SALLY_EVENTS } from '../../../../../infrastructure/events/sally-events.constants';

describe('EDIInvoicingSubscriber', () => {
  let subscriber: EDIInvoicingSubscriber;
  let prisma: any;
  let messageService: any;
  let adapter: any;
  let eventEmitter: any;

  beforeEach(async () => {
    prisma = {
      invoice: { findUnique: jest.fn() },
    };
    messageService = {
      logMessage: jest.fn(),
      updateStatus: jest.fn(),
    };
    adapter = {
      sendInvoice: jest.fn(),
    };
    eventEmitter = {
      emit: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EDIInvoicingSubscriber,
        { provide: PrismaService, useValue: prisma },
        { provide: EDIMessageService, useValue: messageService },
        { provide: EDI_ADAPTER, useValue: adapter },
        { provide: DomainEventService, useValue: eventEmitter },
      ],
    }).compile();

    subscriber = module.get<EDIInvoicingSubscriber>(EDIInvoicingSubscriber);
  });

  describe('onInvoiceSent', () => {
    it('should skip non-EDI invoice', async () => {
      prisma.invoice.findUnique.mockResolvedValue({
        id: 1,
        load: { intakeSource: 'manual', ediTenderMessage: null },
        lineItems: [],
      });

      await subscriber.onInvoiceSent(new DomainEvent(SALLY_EVENTS.INVOICE_SENT, '1', { invoiceId: 1 }));

      expect(messageService.logMessage).not.toHaveBeenCalled();
    });

    it('should skip when invoice has no load', async () => {
      prisma.invoice.findUnique.mockResolvedValue({
        id: 1,
        load: null,
        lineItems: [],
      });

      await subscriber.onInvoiceSent(new DomainEvent(SALLY_EVENTS.INVOICE_SENT, '1', { invoiceId: 1 }));

      expect(messageService.logMessage).not.toHaveBeenCalled();
    });

    it('should send 210 invoice via EDI', async () => {
      prisma.invoice.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 1,
        invoiceNumber: 'INV-001',
        totalCents: 250000,
        loadId: 10,
        load: {
          intakeSource: 'edi',
          intakeMetadata: { brokerReference: 'BR-001' },
          ediTenderMessage: {
            tradingPartner: {
              id: 5,
              vanConfig: { endpoint: 'https://sps.com' },
            },
          },
        },
        lineItems: [
          {
            type: 'linehaul',
            description: 'Linehaul',
            quantity: 1,
            unitPriceCents: 250000,
            totalCents: 250000,
          },
        ],
      });
      messageService.logMessage.mockResolvedValue({ id: 'msg-1' });
      adapter.sendInvoice.mockResolvedValue({ success: true });

      await subscriber.onInvoiceSent(new DomainEvent(SALLY_EVENTS.INVOICE_SENT, '1', { invoiceId: 1 }));

      expect(adapter.sendInvoice).toHaveBeenCalled();
      expect(messageService.updateStatus).toHaveBeenCalledWith('msg-1', 'SENT');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.EDI_MESSAGE_SENT,
        expect.any(Number),
        expect.objectContaining({ messageType: 'T210' }),
      );
    });

    it('should handle invoice send failure', async () => {
      prisma.invoice.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 1,
        invoiceNumber: 'INV-001',
        totalCents: 250000,
        loadId: 10,
        load: {
          intakeSource: 'edi',
          intakeMetadata: { brokerReference: 'BR-001' },
          ediTenderMessage: {
            tradingPartner: { id: 5, vanConfig: {} },
          },
        },
        lineItems: [],
      });
      messageService.logMessage.mockResolvedValue({ id: 'msg-1' });
      adapter.sendInvoice.mockResolvedValue({
        success: false,
        errorMessage: 'VAN rejected',
      });

      await subscriber.onInvoiceSent(new DomainEvent(SALLY_EVENTS.INVOICE_SENT, '1', { invoiceId: 1 }));

      expect(messageService.updateStatus).toHaveBeenCalledWith('msg-1', 'FAILED', 'VAN rejected');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.EDI_MESSAGE_FAILED,
        expect.any(Number),
        expect.objectContaining({ messageType: 'T210' }),
      );
    });

    it('should skip when no trading partner', async () => {
      prisma.invoice.findUnique.mockResolvedValue({
        id: 1,
        load: {
          intakeSource: 'edi',
          ediTenderMessage: { tradingPartner: null },
        },
        lineItems: [],
      });

      await subscriber.onInvoiceSent(new DomainEvent(SALLY_EVENTS.INVOICE_SENT, '1', { invoiceId: 1 }));

      expect(messageService.logMessage).not.toHaveBeenCalled();
    });
  });
});
