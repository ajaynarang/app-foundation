import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { EmailIntakeController } from '../controllers/email-intake.controller';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { EmailIntakeService } from '../services/email-intake.service';
import { LoadsService } from '../../../fleet/loads/services/loads.service';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';

const USER = { tenantDbId: 5, dbId: 10 };

const mockEmailIntakeService = {
  listThreads: jest.fn().mockResolvedValue({ threads: [], total: 0 }),
  getThread: jest.fn(),
  getAttachment: jest.fn(),
  confirmThread: jest.fn(),
  linkLoadToThread: jest.fn(),
  discardThread: jest.fn(),
  restoreThread: jest.fn(),
  approveSenderAndParse: jest.fn(),
  requeueAttachment: jest.fn(),
  findCustomerByMc: jest.fn(),
  findCustomerByName: jest.fn(),
};

const mockLoadsService = {
  create: jest.fn().mockResolvedValue({ loadId: 'LOAD-1', loadNumber: 'LN-1' }),
};

const mockEventEmitter = { emit: jest.fn().mockResolvedValue(undefined) };

describe('EmailIntakeController', () => {
  let controller: EmailIntakeController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmailIntakeController],
      providers: [
        { provide: EmailIntakeService, useValue: mockEmailIntakeService },
        { provide: LoadsService, useValue: mockLoadsService },
        { provide: DomainEventService, useValue: mockEventEmitter },
      ],
    }).compile();

    controller = module.get<EmailIntakeController>(EmailIntakeController);
  });

  // --------------------------------------------------------------------------
  // listThreads / getThread
  // --------------------------------------------------------------------------

  describe('listThreads', () => {
    it('should list threads for tenant', async () => {
      await controller.listThreads(USER, {} as any);

      expect(mockEmailIntakeService.listThreads).toHaveBeenCalledWith(5, expect.anything());
    });
  });

  describe('getThread', () => {
    it('should get thread detail', async () => {
      mockEmailIntakeService.getThread.mockResolvedValue({ id: 1 });

      await controller.getThread(USER, 1);

      expect(mockEmailIntakeService.getThread).toHaveBeenCalledWith(5, 1);
    });
  });

  // --------------------------------------------------------------------------
  // confirmThread
  // --------------------------------------------------------------------------

  describe('confirmThread', () => {
    it('should confirm thread and create load from parsed data', async () => {
      mockEmailIntakeService.getThread.mockResolvedValue({
        id: 1,
        senderEmail: 'broker@test.com',
        subject: 'Rate Con',
        messages: [
          {
            attachments: [
              {
                id: 10,
                isLatestVersion: true,
                parseStatus: 'PARSED',
                parsedData: {
                  load_number: 'L123',
                  broker_name: 'Acme',
                  rate_total_usd: 2000,
                  stops: [
                    {
                      sequence: 1,
                      action_type: 'pickup',
                      city: 'Dallas',
                      state: 'TX',
                    },
                    {
                      sequence: 2,
                      action_type: 'delivery',
                      city: 'Houston',
                      state: 'TX',
                    },
                  ],
                },
              },
            ],
          },
        ],
      });

      const result = await controller.confirmThread(USER, 1, {} as any);
      expect(mockLoadsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 5,
          customerName: 'Acme',
          intakeSource: 'email',
          status: 'DRAFT',
        }),
      );
      expect(mockEmailIntakeService.confirmThread).toHaveBeenCalled();
      expect(mockEmailIntakeService.linkLoadToThread).toHaveBeenCalled();
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.EMAIL_INGEST_CONFIRMED,
        expect.any(Number),
        expect.objectContaining({ threadId: 1 }),
      );
    });

    it('should use specific attachmentId from DTO', async () => {
      mockEmailIntakeService.getThread.mockResolvedValue({
        id: 1,
        senderEmail: 'b@test.com',
        subject: 'RC',
        messages: [],
      });
      mockEmailIntakeService.getAttachment.mockResolvedValue({
        id: 11,
        parsedData: {
          broker_name: 'Specific Broker',
          stops: [],
        },
      });

      await controller.confirmThread(USER, 1, {
        attachmentId: 11,
      } as any);

      expect(mockEmailIntakeService.getAttachment).toHaveBeenCalledWith(5, 11);
    });

    it('should throw if no parsed attachment available', async () => {
      mockEmailIntakeService.getThread.mockResolvedValue({
        id: 1,
        messages: [{ attachments: [] }],
      });

      await expect(controller.confirmThread(USER, 1, {} as any)).rejects.toThrow(BadRequestException);
    });

    it('should find customer by MC number', async () => {
      mockEmailIntakeService.getThread.mockResolvedValue({
        id: 1,
        senderEmail: 'b@test.com',
        subject: 'RC',
        messages: [
          {
            attachments: [
              {
                isLatestVersion: true,
                parseStatus: 'PARSED',
                parsedData: {
                  broker_name: 'MC Broker',
                  broker_mc: 'MC999',
                  stops: [],
                },
              },
            ],
          },
        ],
      });
      mockEmailIntakeService.findCustomerByMc.mockResolvedValue(42);

      await controller.confirmThread(USER, 1, {} as any);

      expect(mockEmailIntakeService.findCustomerByMc).toHaveBeenCalledWith(5, 'MC999');
      expect(mockLoadsService.create).toHaveBeenCalledWith(expect.objectContaining({ customerId: 42 }));
    });

    it('should fall back to name match if MC not found', async () => {
      mockEmailIntakeService.getThread.mockResolvedValue({
        id: 1,
        senderEmail: 'b@test.com',
        subject: 'RC',
        messages: [
          {
            attachments: [
              {
                isLatestVersion: true,
                parseStatus: 'PARSED',
                parsedData: {
                  broker_name: 'Name Match Broker',
                  broker_mc: 'MC999',
                  stops: [],
                },
              },
            ],
          },
        ],
      });
      mockEmailIntakeService.findCustomerByMc.mockResolvedValue(null);
      mockEmailIntakeService.findCustomerByName.mockResolvedValue(88);

      await controller.confirmThread(USER, 1, {} as any);

      expect(mockEmailIntakeService.findCustomerByName).toHaveBeenCalledWith(5, 'Name Match Broker');
    });
  });

  // --------------------------------------------------------------------------
  // discardThread / restoreThread
  // --------------------------------------------------------------------------

  describe('discardThread', () => {
    it('should discard thread', async () => {
      const result = await controller.discardThread(USER, 1);

      expect(result).toEqual({ status: 'discarded' });
      expect(mockEmailIntakeService.discardThread).toHaveBeenCalledWith(5, 1);
    });
  });

  describe('restoreThread', () => {
    it('should restore thread', async () => {
      const result = await controller.restoreThread(USER, 1);

      expect(result).toEqual({ status: 'restored' });
    });
  });

  // --------------------------------------------------------------------------
  // approveSenderAndParse / reparseAttachment
  // --------------------------------------------------------------------------

  describe('approveSenderAndParse', () => {
    it('should delegate to service', async () => {
      mockEmailIntakeService.approveSenderAndParse.mockResolvedValue({
        approved: true,
      });

      await controller.approveSenderAndParse(USER, 1);

      expect(mockEmailIntakeService.approveSenderAndParse).toHaveBeenCalledWith(5, 1);
    });
  });

  describe('reparseAttachment', () => {
    it('should delegate to service', async () => {
      mockEmailIntakeService.requeueAttachment.mockResolvedValue({
        queued: true,
      });

      await controller.reparseAttachment(USER, 10);

      expect(mockEmailIntakeService.requeueAttachment).toHaveBeenCalledWith(5, 10);
    });
  });
});
