import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { SupportService } from '../support.service';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';

describe('SupportService', () => {
  let service: SupportService;
  let prisma: any;

  const mockUser = {
    userId: 'usr-001',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@test.com',
    role: 'ADMIN',
  };

  const mockTicket = {
    id: 1,
    ticketNumber: 'ST-1001',
    subject: 'Cannot sync ELD',
    description: 'Integration fails',
    category: 'TECHNICAL',
    priority: 'HIGH',
    status: 'OPEN',
    tenantId: 1,
    aiResolved: false,
    relatedEntities: null,
    firstResponseAt: null,
    resolvedAt: null,
    closedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: mockUser,
    _count: { messages: 0 },
  };

  beforeEach(async () => {
    prisma = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(0),
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ nextval: '1001' }]),
      supportTicket: {
        create: jest.fn().mockResolvedValue(mockTicket),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn(),
      },
      supportTicketMessage: {
        create: jest.fn(),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SupportService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(SupportService);
    jest.clearAllMocks();
    prisma.$executeRawUnsafe.mockResolvedValue(0);
    prisma.$queryRawUnsafe.mockResolvedValue([{ nextval: '1001' }]);
  });

  // ─── createTicket ───

  describe('createTicket', () => {
    it('should create a ticket with generated ticket number', async () => {
      prisma.supportTicket.create.mockResolvedValue(mockTicket);

      const result = await service.createTicket(1, 5, {
        subject: 'Cannot sync ELD',
        description: 'Integration fails',
        category: 'TECHNICAL',
        priority: 'HIGH',
      });

      expect(result.ticketNumber).toBe('ST-1001');
      expect(result.subject).toBe('Cannot sync ELD');
      expect(prisma.supportTicket.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ticketNumber: 'ST-1001',
            tenantId: 1,
            createdById: 5,
            subject: 'Cannot sync ELD',
            category: 'TECHNICAL',
            priority: 'HIGH',
          }),
        }),
      );
    });

    it('should default category to GENERAL and priority to MEDIUM', async () => {
      prisma.supportTicket.create.mockResolvedValue({
        ...mockTicket,
        category: 'GENERAL',
        priority: 'MEDIUM',
      });

      await service.createTicket(1, 5, {
        subject: 'Help',
        description: 'Need help',
      });

      expect(prisma.supportTicket.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            category: 'GENERAL',
            priority: 'MEDIUM',
          }),
        }),
      );
    });
  });

  // ─── listTicketsForTenant ───

  describe('listTicketsForTenant', () => {
    it('should return paginated tickets for tenant', async () => {
      prisma.supportTicket.findMany.mockResolvedValue([mockTicket]);
      prisma.supportTicket.count.mockResolvedValue(1);

      const result = await service.listTicketsForTenant(1, {
        limit: 10,
        offset: 0,
      });

      expect(result.tickets).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(prisma.supportTicket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 1 },
          take: 10,
          skip: 0,
        }),
      );
    });

    it('should filter by status', async () => {
      prisma.supportTicket.findMany.mockResolvedValue([]);
      prisma.supportTicket.count.mockResolvedValue(0);

      await service.listTicketsForTenant(1, { status: 'OPEN' });

      expect(prisma.supportTicket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 1, status: 'OPEN' },
        }),
      );
    });

    it('should enforce tenant isolation', async () => {
      prisma.supportTicket.findMany.mockResolvedValue([]);
      prisma.supportTicket.count.mockResolvedValue(0);

      await service.listTicketsForTenant(42, {});

      expect(prisma.supportTicket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 42 }),
        }),
      );
    });
  });

  // ─── getTicket ───

  describe('getTicket', () => {
    it('should throw NotFoundException when ticket not found', async () => {
      prisma.supportTicket.findFirst.mockResolvedValue(null);

      await expect(service.getTicket(999, 1)).rejects.toThrow(NotFoundException);
    });

    it('should return ticket with messages for tenant user', async () => {
      const ticket = {
        ...mockTicket,
        messages: [
          {
            messageId: 'm1',
            authorRole: 'user',
            content: 'Help',
            isInternal: false,
            author: mockUser,
            createdAt: new Date(),
          },
          {
            messageId: 'm2',
            authorRole: 'admin',
            content: 'Internal note',
            isInternal: true,
            author: mockUser,
            createdAt: new Date(),
          },
        ],
        conversation: null,
        tenant: { tenantId: 'tnt-1', companyName: 'Test', plan: 'PRO' },
      };
      prisma.supportTicket.findFirst.mockResolvedValue(ticket);

      const result = await service.getTicket(1, 1, false);

      // Non-admin should not see internal notes
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content).toBe('Help');
    });

    it('should return internal notes for super admin', async () => {
      const ticket = {
        ...mockTicket,
        messages: [
          {
            messageId: 'm1',
            authorRole: 'user',
            content: 'Help',
            isInternal: false,
            author: mockUser,
            createdAt: new Date(),
          },
          {
            messageId: 'm2',
            authorRole: 'admin',
            content: 'Internal note',
            isInternal: true,
            author: mockUser,
            createdAt: new Date(),
          },
        ],
        conversation: null,
        tenant: { tenantId: 'tnt-1', companyName: 'Test', plan: 'PRO' },
      };
      prisma.supportTicket.findFirst.mockResolvedValue(ticket);

      const result = await service.getTicket(1, 1, true);

      expect(result.messages).toHaveLength(2);
    });

    it('should bypass tenantId filter for super admin', async () => {
      const ticket = {
        ...mockTicket,
        messages: [],
        conversation: null,
        tenant: null,
      };
      prisma.supportTicket.findFirst.mockResolvedValue(ticket);

      await service.getTicket(1, 99, true);

      expect(prisma.supportTicket.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 }, // no tenantId
        }),
      );
    });
  });

  // ─── addMessage ───

  describe('addMessage', () => {
    it('should create message and return it', async () => {
      prisma.supportTicket.findFirst.mockResolvedValue({
        id: 1,
        firstResponseAt: null,
      });
      const message = {
        messageId: 'msg-001',
        ticketId: 1,
        authorRole: 'user',
        content: 'I need help',
        isInternal: false,
        author: mockUser,
        createdAt: new Date(),
      };
      prisma.supportTicketMessage.create.mockResolvedValue(message);

      const result = await service.addMessage(1, 5, 'user', { content: 'I need help' }, 1);

      expect(result.content).toBe('I need help');
      expect(result.isInternal).toBe(false);
    });

    it('should track first response time for admin reply', async () => {
      prisma.supportTicket.findFirst.mockResolvedValue({
        id: 1,
        firstResponseAt: null,
      });
      prisma.supportTicketMessage.create.mockResolvedValue({
        messageId: 'msg-002',
        ticketId: 1,
        authorRole: 'admin',
        content: 'Looking into it',
        isInternal: false,
        author: mockUser,
        createdAt: new Date(),
      });

      await service.addMessage(1, 10, 'admin', { content: 'Looking into it' }, 1, true);

      expect(prisma.supportTicket.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { firstResponseAt: expect.any(Date) },
      });
    });

    it('should not track first response if already tracked', async () => {
      prisma.supportTicket.findFirst.mockResolvedValue({
        id: 1,
        firstResponseAt: new Date(),
      });
      prisma.supportTicketMessage.create.mockResolvedValue({
        messageId: 'msg-003',
        ticketId: 1,
        authorRole: 'admin',
        content: 'Follow up',
        isInternal: false,
        author: mockUser,
        createdAt: new Date(),
      });

      await service.addMessage(1, 10, 'admin', { content: 'Follow up' }, 1, true);

      expect(prisma.supportTicket.update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if ticket not found', async () => {
      prisma.supportTicket.findFirst.mockResolvedValue(null);

      await expect(service.addMessage(999, 5, 'user', { content: 'Hello' }, 1)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── updateTicket ───

  describe('updateTicket', () => {
    it('should update ticket status', async () => {
      prisma.supportTicket.update.mockResolvedValue({
        ...mockTicket,
        status: 'IN_PROGRESS',
        createdBy: mockUser,
        tenant: null,
      });

      const result = await service.updateTicket(1, { status: 'IN_PROGRESS' });

      expect(result.status).toBe('IN_PROGRESS');
      expect(prisma.supportTicket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'IN_PROGRESS' },
        }),
      );
    });

    it('should set resolvedAt when status is RESOLVED', async () => {
      prisma.supportTicket.update.mockResolvedValue({
        ...mockTicket,
        status: 'RESOLVED',
        resolvedAt: new Date(),
        createdBy: mockUser,
        tenant: null,
      });

      await service.updateTicket(1, { status: 'RESOLVED' });

      expect(prisma.supportTicket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'RESOLVED',
            resolvedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('should set closedAt when status is CLOSED', async () => {
      prisma.supportTicket.update.mockResolvedValue({
        ...mockTicket,
        status: 'CLOSED',
        closedAt: new Date(),
        createdBy: mockUser,
        tenant: null,
      });

      await service.updateTicket(1, { status: 'CLOSED' });

      expect(prisma.supportTicket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'CLOSED',
            closedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('should update priority', async () => {
      prisma.supportTicket.update.mockResolvedValue({
        ...mockTicket,
        priority: 'CRITICAL',
        createdBy: mockUser,
        tenant: null,
      });

      await service.updateTicket(1, { priority: 'CRITICAL' });

      expect(prisma.supportTicket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { priority: 'CRITICAL' },
        }),
      );
    });
  });

  // ─── getStats ───

  describe('getStats', () => {
    it('should return aggregated stats', async () => {
      prisma.supportTicket.count
        .mockResolvedValueOnce(5) // open
        .mockResolvedValueOnce(3) // in_progress
        .mockResolvedValueOnce(2) // waiting
        .mockResolvedValueOnce(10); // resolved
      prisma.$queryRawUnsafe.mockResolvedValue([{ avg_hours: 4.5 }]);

      const result = await service.getStats();

      expect(result.open).toBe(5);
      expect(result.inProgress).toBe(3);
      expect(result.waiting).toBe(2);
      expect(result.resolvedLast30d).toBe(10);
      expect(result.avgResponseHours).toBe(4.5);
    });

    it('should default avgResponseHours to 0 when null', async () => {
      prisma.supportTicket.count.mockResolvedValue(0);
      prisma.$queryRawUnsafe.mockResolvedValue([{ avg_hours: null }]);

      const result = await service.getStats();

      expect(result.avgResponseHours).toBe(0);
    });
  });

  // ─── listAllTickets (Super Admin) ───

  describe('listAllTickets', () => {
    it('should search by subject or ticket number', async () => {
      prisma.supportTicket.findMany.mockResolvedValue([]);
      prisma.supportTicket.count.mockResolvedValue(0);

      await service.listAllTickets({ search: 'ST-1001' });

      expect(prisma.supportTicket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({
                subject: { contains: 'ST-1001', mode: 'insensitive' },
              }),
              expect.objectContaining({
                ticketNumber: { contains: 'ST-1001', mode: 'insensitive' },
              }),
            ]),
          }),
        }),
      );
    });

    it('should filter by multiple criteria', async () => {
      prisma.supportTicket.findMany.mockResolvedValue([]);
      prisma.supportTicket.count.mockResolvedValue(0);

      await service.listAllTickets({
        tenantId: 1,
        status: 'OPEN',
        priority: 'HIGH',
        category: 'TECHNICAL',
      });

      expect(prisma.supportTicket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 1,
            status: 'OPEN',
            priority: 'HIGH',
            category: 'TECHNICAL',
          }),
        }),
      );
    });
  });
});
