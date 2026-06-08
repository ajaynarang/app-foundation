// Mock Prisma/pg so tests run without a real DB or generated client
jest.mock('@prisma/client', () => ({
  PrismaClient: class PrismaClient {},
}));
jest.mock('@prisma/adapter-pg', () => ({ PrismaPg: jest.fn() }));
jest.mock('pg', () => ({ default: { Pool: jest.fn() } }));

import { Test, TestingModule } from '@nestjs/testing';
import {
  EmailThreadTrackerService,
  FindOrCreateThreadInput,
  HandleRevisionInput,
} from '../email-thread-tracker.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

const mockPrisma = {
  emailIngestThread: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  emailIngestAttachment: {
    updateMany: jest.fn(),
  },
};

const makeThread = (overrides = {}) => ({
  id: 'thread-1',
  tenantId: 1,
  senderEmail: 'broker@example.com',
  senderName: 'Broker',
  subject: 'Rate Confirmation',
  messageIdChain: ['msg-1'],
  status: 'PENDING',
  confirmedLoadId: null,
  confirmedAt: null,
  confirmedById: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('EmailThreadTrackerService', () => {
  let service: EmailThreadTrackerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EmailThreadTrackerService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<EmailThreadTrackerService>(EmailThreadTrackerService);
    jest.resetAllMocks();
  });

  describe('findOrCreateThread', () => {
    const baseInput: FindOrCreateThreadInput = {
      tenantId: 1,
      senderEmail: 'broker@example.com',
      senderName: 'Broker',
      subject: 'Rate Confirmation',
      messageId: 'msg-2',
      references: [],
    };

    it('creates a new thread when no existing thread is found', async () => {
      const newThread = makeThread({
        id: 'thread-new',
        messageIdChain: ['msg-2'],
      });
      mockPrisma.emailIngestThread.findFirst.mockResolvedValue(null);
      mockPrisma.emailIngestThread.create.mockResolvedValue(newThread);

      const result = await service.findOrCreateThread(baseInput);

      expect(mockPrisma.emailIngestThread.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 1,
            senderEmail: 'broker@example.com',
            messageIdChain: ['msg-2'],
          }),
        }),
      );
      expect(result.id).toBe('thread-new');
    });

    it('returns and updates the existing thread when References match', async () => {
      const existingThread = makeThread({ messageIdChain: ['msg-1'] });
      const updatedThread = makeThread({
        messageIdChain: ['msg-1', 'msg-2'],
      });

      mockPrisma.emailIngestThread.findFirst.mockResolvedValue(existingThread);
      mockPrisma.emailIngestThread.update.mockResolvedValue(updatedThread);

      const result = await service.findOrCreateThread({
        ...baseInput,
        messageId: 'msg-2',
        references: ['msg-1'],
      });

      expect(mockPrisma.emailIngestThread.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            messageIdChain: { hasSome: ['msg-1'] },
          }),
        }),
      );
      expect(mockPrisma.emailIngestThread.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'thread-1' },
          data: { messageIdChain: ['msg-1', 'msg-2'] },
        }),
      );
      expect(result.id).toBe('thread-1');
    });

    it('does not query for existing thread when references is empty', async () => {
      const newThread = makeThread({ id: 'thread-new' });
      mockPrisma.emailIngestThread.create.mockResolvedValue(newThread);

      await service.findOrCreateThread({ ...baseInput, references: [] });

      expect(mockPrisma.emailIngestThread.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.emailIngestThread.create).toHaveBeenCalled();
    });
  });

  describe('handleRevision', () => {
    const baseInput: HandleRevisionInput = {
      threadId: 1,
      attachmentId: 10,
      loadNumber: 'LD-001',
    };

    it('marks old versions as not latest when same load number exists in thread', async () => {
      mockPrisma.emailIngestThread.findUnique.mockResolvedValue({
        messages: [
          {
            attachments: [{ id: 'attach-old-1' }],
          },
          {
            attachments: [{ id: 'attach-old-2' }],
          },
        ],
      });
      mockPrisma.emailIngestAttachment.updateMany.mockResolvedValue({
        count: 2,
      });

      await service.handleRevision(baseInput);

      expect(mockPrisma.emailIngestAttachment.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['attach-old-1', 'attach-old-2'] } },
        data: { isLatestVersion: false },
      });
    });

    it('does nothing when no previous versions exist in the thread', async () => {
      mockPrisma.emailIngestThread.findUnique.mockResolvedValue({
        messages: [{ attachments: [] }],
      });

      await service.handleRevision(baseInput);

      expect(mockPrisma.emailIngestAttachment.updateMany).not.toHaveBeenCalled();
    });

    it('logs a warning and returns early when thread is not found', async () => {
      mockPrisma.emailIngestThread.findUnique.mockResolvedValue(null);

      await service.handleRevision(baseInput);

      expect(mockPrisma.emailIngestAttachment.updateMany).not.toHaveBeenCalled();
    });
  });
});
