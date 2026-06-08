import { Test, TestingModule } from '@nestjs/testing';
import { EDITrackingSubscriber } from '../edi-tracking.subscriber';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { DomainEventService } from '../../../../../infrastructure/events/domain-event.service';
import { EDIMessageService } from '../../services/edi-message.service';
import { EDI_ADAPTER } from '../../adapters/edi-adapter.interface';
import { DomainEvent } from '../../../../../infrastructure/events/domain-event';
import { SALLY_EVENTS } from '../../../../../infrastructure/events/sally-events.constants';

describe('EDITrackingSubscriber', () => {
  let subscriber: EDITrackingSubscriber;
  let prisma: any;
  let messageService: any;
  let adapter: any;
  let eventEmitter: any;

  beforeEach(async () => {
    prisma = {
      load: { findUnique: jest.fn() },
    };
    messageService = {
      logMessage: jest.fn(),
      updateStatus: jest.fn(),
    };
    adapter = {
      sendStatusUpdate: jest.fn(),
    };
    eventEmitter = {
      emit: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EDITrackingSubscriber,
        { provide: PrismaService, useValue: prisma },
        { provide: EDIMessageService, useValue: messageService },
        { provide: EDI_ADAPTER, useValue: adapter },
        { provide: DomainEventService, useValue: eventEmitter },
      ],
    }).compile();

    subscriber = module.get<EDITrackingSubscriber>(EDITrackingSubscriber);
  });

  describe('onLoadStatusChanged', () => {
    it('should do nothing for unmapped status', async () => {
      await subscriber.onLoadStatusChanged(
        new DomainEvent(SALLY_EVENTS.LOAD_STATUS_CHANGED, '1', {
          loadId: 1,
          loadNumber: 'L001',
          status: 'PENDING',
        }),
      );

      expect(prisma.load.findUnique).not.toHaveBeenCalled();
    });

    it('should send 214 for in_transit status', async () => {
      prisma.load.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 1,
        intakeSource: 'edi',
        intakeMetadata: { brokerReference: 'BR-001' },
        ediTenderMessage: {
          tradingPartner: {
            id: 10,
            vanConfig: { endpoint: 'https://sps.com' },
          },
        },
      });
      messageService.logMessage.mockResolvedValue({ id: 'msg-1' });
      adapter.sendStatusUpdate.mockResolvedValue({ success: true });

      await subscriber.onLoadStatusChanged(
        new DomainEvent(SALLY_EVENTS.LOAD_STATUS_CHANGED, '1', {
          loadId: 1,
          loadNumber: 'L001',
          status: 'IN_TRANSIT',
        }),
      );

      expect(adapter.sendStatusUpdate).toHaveBeenCalled();
      expect(messageService.updateStatus).toHaveBeenCalledWith('msg-1', 'SENT');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.EDI_MESSAGE_SENT,
        expect.any(Number),
        expect.objectContaining({ messageType: 'T214' }),
      );
    });

    it('should handle send failure', async () => {
      prisma.load.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 1,
        intakeSource: 'edi',
        intakeMetadata: { brokerReference: 'BR-001' },
        ediTenderMessage: {
          tradingPartner: { id: 10, vanConfig: {} },
        },
      });
      messageService.logMessage.mockResolvedValue({ id: 'msg-1' });
      adapter.sendStatusUpdate.mockResolvedValue({
        success: false,
        errorMessage: 'SPS timeout',
      });

      await subscriber.onLoadStatusChanged(
        new DomainEvent(SALLY_EVENTS.LOAD_STATUS_CHANGED, '1', {
          loadId: 1,
          loadNumber: 'L001',
          status: 'DELIVERED',
        }),
      );

      expect(messageService.updateStatus).toHaveBeenCalledWith('msg-1', 'FAILED', 'SPS timeout');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.EDI_MESSAGE_FAILED,
        expect.any(Number),
        expect.objectContaining({ messageType: 'T214' }),
      );
    });

    it('should skip non-EDI loads', async () => {
      prisma.load.findUnique.mockResolvedValue({
        id: 1,
        intakeSource: 'manual',
        ediTenderMessage: null,
      });

      await subscriber.onLoadStatusChanged(
        new DomainEvent(SALLY_EVENTS.LOAD_STATUS_CHANGED, '1', {
          loadId: 1,
          loadNumber: 'L001',
          status: 'IN_TRANSIT',
        }),
      );

      expect(messageService.logMessage).not.toHaveBeenCalled();
    });
  });

  describe('onStopStatusChanged', () => {
    it('should do nothing for unmapped stop status', async () => {
      await subscriber.onStopStatusChanged(
        new DomainEvent(SALLY_EVENTS.LOAD_STOP_STATUS_CHANGED, '1', {
          loadId: 1,
          loadNumber: 'L001',
          stopId: 5,
          status: 'PENDING',
        }),
      );

      expect(prisma.load.findUnique).not.toHaveBeenCalled();
    });

    it('should send 214 for arrived stop status', async () => {
      prisma.load.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 1,
        intakeSource: 'edi',
        intakeMetadata: { brokerReference: 'BR-001' },
        ediTenderMessage: {
          tradingPartner: { id: 10, vanConfig: {} },
        },
      });
      messageService.logMessage.mockResolvedValue({ id: 'msg-2' });
      adapter.sendStatusUpdate.mockResolvedValue({ success: true });

      await subscriber.onStopStatusChanged(
        new DomainEvent(SALLY_EVENTS.LOAD_STOP_STATUS_CHANGED, '1', {
          loadId: 1,
          loadNumber: 'L001',
          stopId: 5,
          status: 'arrived',
        }),
      );

      expect(adapter.sendStatusUpdate).toHaveBeenCalled();
      expect(messageService.updateStatus).toHaveBeenCalledWith('msg-2', 'SENT');
    });
  });
});
