import { Test, TestingModule } from '@nestjs/testing';
import { EDIDirection, EDIMessageType } from '@prisma/client';
import { EDIMessageService } from '../edi-message.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

describe('EDIMessageService', () => {
  let service: EDIMessageService;

  const mockPrismaService = {
    eDIMessage: {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EDIMessageService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<EDIMessageService>(EDIMessageService);
    jest.clearAllMocks();
  });

  describe('logMessage', () => {
    it('should create an inbound message with RECEIVED status', async () => {
      const params = {
        tenantId: 1,
        tradingPartnerId: 1,
        direction: EDIDirection.INBOUND,
        messageType: EDIMessageType.T204,
        transactionSetId: 'TSI-001',
        referenceNumber: 'REF-001',
        rawPayload: '{"test": true}',
      };

      const createdMessage = { id: 1, ...params, status: 'RECEIVED' };
      mockPrismaService.eDIMessage.create.mockResolvedValue(createdMessage);

      const result = await service.logMessage(params);

      expect(result).toEqual(createdMessage);
      expect(mockPrismaService.eDIMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 1,
          tradingPartnerId: 1,
          direction: 'INBOUND',
          messageType: 'T204',
          status: 'RECEIVED',
        }),
      });
    });

    it('should create an outbound message with PROCESSING status', async () => {
      const params = {
        tenantId: 1,
        tradingPartnerId: 1,
        direction: EDIDirection.OUTBOUND,
        messageType: EDIMessageType.T210,
      };

      mockPrismaService.eDIMessage.create.mockResolvedValue({
        id: 2,
        ...params,
        status: 'PROCESSING',
      });

      await service.logMessage(params);

      expect(mockPrismaService.eDIMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'PROCESSING',
        }),
      });
    });
  });

  describe('updateStatus', () => {
    it('should update message status', async () => {
      mockPrismaService.eDIMessage.update.mockResolvedValue({
        id: 1,
        status: 'DELIVERED',
      });

      const result = await service.updateStatus(1, 'DELIVERED');

      expect(result.status).toBe('DELIVERED');
      expect(mockPrismaService.eDIMessage.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 'DELIVERED' },
      });
    });

    it('should update status with error message and increment retry count', async () => {
      mockPrismaService.eDIMessage.update.mockResolvedValue({
        id: 1,
        status: 'FAILED',
        errorMessage: 'Connection timeout',
        retryCount: 2,
      });

      const result = await service.updateStatus(1, 'FAILED', 'Connection timeout');

      expect(result.status).toBe('FAILED');
      expect(mockPrismaService.eDIMessage.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          status: 'FAILED',
          errorMessage: 'Connection timeout',
          retryCount: { increment: 1 },
        },
      });
    });
  });

  describe('listMessages', () => {
    it('should return paginated messages with defaults', async () => {
      const messages = [
        {
          id: 1,
          direction: 'INBOUND',
          messageType: 'T204',
          tradingPartner: { name: 'ABC' },
          load: null,
        },
        {
          id: 2,
          direction: 'OUTBOUND',
          messageType: 'T214',
          tradingPartner: { name: 'XYZ' },
          load: { loadNumber: 'L001' },
        },
      ];
      mockPrismaService.eDIMessage.findMany.mockResolvedValue(messages);
      mockPrismaService.eDIMessage.count.mockResolvedValue(2);

      const result = await service.listMessages(1);

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
    });

    it('should filter by direction and messageType', async () => {
      mockPrismaService.eDIMessage.findMany.mockResolvedValue([]);
      mockPrismaService.eDIMessage.count.mockResolvedValue(0);

      await service.listMessages(1, {
        direction: 'INBOUND',
        messageType: 'T204',
      });

      expect(mockPrismaService.eDIMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 1, direction: 'INBOUND', messageType: 'T204' },
        }),
      );
    });

    it('should respect pagination params', async () => {
      mockPrismaService.eDIMessage.findMany.mockResolvedValue([]);
      mockPrismaService.eDIMessage.count.mockResolvedValue(100);

      const result = await service.listMessages(1, { page: 3, limit: 10 });

      expect(result.page).toBe(3);
      expect(result.limit).toBe(10);
      expect(mockPrismaService.eDIMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
        }),
      );
    });

    it('should filter by status', async () => {
      mockPrismaService.eDIMessage.findMany.mockResolvedValue([]);
      mockPrismaService.eDIMessage.count.mockResolvedValue(0);

      await service.listMessages(1, { status: 'FAILED' });

      expect(mockPrismaService.eDIMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 1, status: 'FAILED' },
        }),
      );
    });

    it('should filter by tradingPartnerId', async () => {
      mockPrismaService.eDIMessage.findMany.mockResolvedValue([]);
      mockPrismaService.eDIMessage.count.mockResolvedValue(0);

      await service.listMessages(1, { tradingPartnerId: 5 });

      expect(mockPrismaService.eDIMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 1, tradingPartnerId: 5 },
        }),
      );
    });
  });

  describe('markResponded', () => {
    it('should set respondedAt to current time', async () => {
      mockPrismaService.eDIMessage.update.mockResolvedValue({
        id: 1,
        respondedAt: new Date(),
      });

      await service.markResponded(1);

      expect(mockPrismaService.eDIMessage.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { respondedAt: expect.any(Date) },
      });
    });
  });

  describe('findPendingTenders', () => {
    it('should find pending T204 messages', async () => {
      const tenders = [{ id: 1, messageType: 'T204', status: 'RECEIVED' }];
      mockPrismaService.eDIMessage.findMany.mockResolvedValue(tenders);

      const result = await service.findPendingTenders(1);

      expect(result).toEqual(tenders);
      expect(mockPrismaService.eDIMessage.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: 1,
          messageType: 'T204',
          status: 'RECEIVED',
          OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
        },
        include: { tradingPartner: true, load: true },
        orderBy: { createdAt: 'desc' },
      });
    });
  });
});
