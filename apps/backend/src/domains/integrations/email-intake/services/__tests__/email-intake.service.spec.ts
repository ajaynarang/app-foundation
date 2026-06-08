import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { DomainEventService } from '../../../../../infrastructure/events/domain-event.service';
import { EmailIntakeService, extractEmail, extractName } from '../email-intake.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { FileStorageService } from '../../../../../infrastructure/storage/file-storage.service';
import { EmailFilterService } from '../email-filter.service';
import { EmailThreadTrackerService } from '../email-thread-tracker.service';
import { ResendInboundService } from '../resend-inbound.service';
import { QUEUE_NAMES } from '../../../../../infrastructure/queue/queue.constants';
import type { ResendInboundEmailDataDto } from '../../dto/resend-inbound-webhook.dto';

describe('EmailIntakeService', () => {
  let service: EmailIntakeService;
  let prisma: jest.Mocked<PrismaService>;
  let resendInbound: jest.Mocked<ResendInboundService>;
  let filterService: jest.Mocked<EmailFilterService>;
  let threadTracker: jest.Mocked<EmailThreadTrackerService>;
  let fileStorage: jest.Mocked<FileStorageService>;
  let emailQueue: { add: jest.Mock };

  beforeEach(async () => {
    const mockPrisma = {
      emailIngestSettings: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      tenant: {
        findUnique: jest.fn(),
      },
      emailIngestMessage: {
        create: jest.fn(),
      },
      emailIngestAttachment: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      emailIngestThread: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
    };

    const mockResendInbound = {
      getEmail: jest.fn(),
      downloadAttachment: jest.fn(),
    };

    const mockFilterService = {
      filter: jest.fn(),
    };

    const mockThreadTracker = {
      findOrCreateThread: jest.fn(),
    };

    const mockFileStorage = {
      uploadBuffer: jest.fn(),
    };

    emailQueue = { add: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        EmailIntakeService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              if (key === 'EMAIL_INGEST_INBOUND_DOMAIN') return 'inbound.sally.appshore.in';
              return defaultValue;
            }),
          },
        },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: FileStorageService, useValue: mockFileStorage },
        { provide: EmailFilterService, useValue: mockFilterService },
        { provide: EmailThreadTrackerService, useValue: mockThreadTracker },
        { provide: ResendInboundService, useValue: mockResendInbound },
        {
          provide: DomainEventService,
          useValue: { emit: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: getQueueToken(QUEUE_NAMES.DOCUMENTS),
          useValue: emailQueue,
        },
      ],
    }).compile();

    service = module.get(EmailIntakeService);
    prisma = module.get(PrismaService);
    resendInbound = module.get(ResendInboundService);
    filterService = module.get(EmailFilterService);
    threadTracker = module.get(EmailThreadTrackerService);
    fileStorage = module.get(FileStorageService);
  });

  describe('resolveTenant', () => {
    it('should return tenant info when settings exist', async () => {
      const settings = {
        id: 'settings-1',
        tenantId: 1,
        inboundAddress: 'loads-demo@inbound.sally.appshore.in',
        isEnabled: true,
      };
      (prisma.emailIngestSettings.findUnique as jest.Mock).mockResolvedValue(settings);

      const result = await service.resolveTenant('loads-demo@inbound.sally.appshore.in');

      expect(result).toEqual({
        tenantId: 1,
        isEnabled: true,
        settings,
      });
    });

    it('should return null when no settings found', async () => {
      (prisma.emailIngestSettings.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.resolveTenant('unknown@inbound.sally.appshore.in');

      expect(result).toBeNull();
    });
  });

  describe('provisionSettings', () => {
    it('should return existing settings if already provisioned', async () => {
      const existing = {
        id: 'settings-1',
        tenantId: 1,
        inboundAddress: 'loads-demo@inbound.sally.appshore.in',
      };
      (prisma.emailIngestSettings.findUnique as jest.Mock).mockResolvedValue(existing);

      const result = await service.provisionSettings(1);

      expect(result).toEqual(existing);
      expect(prisma.emailIngestSettings.create).not.toHaveBeenCalled();
    });

    it('should create settings with generated inbound address', async () => {
      (prisma.emailIngestSettings.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({
        tenantId: 'sally-demo',
      });

      const created = {
        id: 'settings-new',
        tenantId: 1,
        inboundAddress: 'loads-sally-demo@inbound.sally.appshore.in',
      };
      (prisma.emailIngestSettings.create as jest.Mock).mockResolvedValue(created);

      const result = await service.provisionSettings(1);

      expect(result).toEqual(created);
      expect(prisma.emailIngestSettings.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 1,
          inboundAddress: 'loads-sally-demo@inbound.sally.appshore.in',
          approvedDomains: [],
          autoApproveCustomerDomains: true,
          unknownSenderPolicy: 'HOLD',
          isEnabled: true,
        }),
      });
    });

    it('should throw NotFoundException when tenant not found', async () => {
      (prisma.emailIngestSettings.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.provisionSettings(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('processInboundEmail', () => {
    const baseThread = {
      id: 1,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    };

    const baseMessage = { id: 10, threadId: 1 };

    const webhookData: ResendInboundEmailDataDto = {
      email_id: 'email-abc123',
      from: 'Broker <broker@example.com>',
      to: ['loads-demo@inbound.sally.appshore.in'],
      subject: 'Rate Confirmation',
      message_id: '<msg-123@example.com>',
      attachments: [],
    };

    it('should process an email with no attachments', async () => {
      (resendInbound.getEmail as jest.Mock).mockResolvedValue({
        id: 'email-abc123',
        text: 'Hello world',
        html: '<p>Hello world</p>',
        headers: {},
        message_id: '<msg-123@example.com>',
      });
      (threadTracker.findOrCreateThread as jest.Mock).mockResolvedValue(baseThread);
      (prisma.emailIngestMessage.create as jest.Mock).mockResolvedValue(baseMessage);

      const result = await service.processInboundEmail(1, webhookData);

      expect(resendInbound.getEmail).toHaveBeenCalledWith('email-abc123');
      expect(result.threadId).toBe(1);
      expect(result.messageId).toBe(10);
      expect(result.results).toHaveLength(0);
    });

    it('should extract in-reply-to from fetched email headers for threading', async () => {
      (resendInbound.getEmail as jest.Mock).mockResolvedValue({
        id: 'email-abc123',
        text: null,
        html: null,
        headers: { 'in-reply-to': '<original@example.com>' },
        message_id: '<msg-123@example.com>',
      });
      (threadTracker.findOrCreateThread as jest.Mock).mockResolvedValue(baseThread);
      (prisma.emailIngestMessage.create as jest.Mock).mockResolvedValue(baseMessage);

      await service.processInboundEmail(1, webhookData);

      expect(threadTracker.findOrCreateThread).toHaveBeenCalledWith(
        expect.objectContaining({
          references: ['<original@example.com>'],
        }),
      );
    });

    it('should download attachment binary and queue for parsing when filter passes', async () => {
      const attachmentMeta = {
        id: 'att-id-1',
        filename: 'ratecon.pdf',
        content_type: 'application/pdf',
      };
      const dataWithAttachment: ResendInboundEmailDataDto = {
        ...webhookData,
        attachments: [attachmentMeta],
      };
      const fakeBuffer = Buffer.from('fake-pdf-content');
      const fakeAttachmentRecord = { id: 'db-att-1' };

      (resendInbound.getEmail as jest.Mock).mockResolvedValue({
        id: 'email-abc123',
        text: 'See attached',
        html: null,
        headers: {},
        message_id: '<msg-123@example.com>',
      });
      (threadTracker.findOrCreateThread as jest.Mock).mockResolvedValue(baseThread);
      (prisma.emailIngestMessage.create as jest.Mock).mockResolvedValue(baseMessage);
      (resendInbound.downloadAttachment as jest.Mock).mockResolvedValue(fakeBuffer);
      (filterService.filter as jest.Mock).mockResolvedValue({
        result: 'PASSED',
      });
      (fileStorage.uploadBuffer as jest.Mock).mockResolvedValue(undefined);
      (prisma.emailIngestAttachment.create as jest.Mock).mockResolvedValue(fakeAttachmentRecord);

      const result = await service.processInboundEmail(1, dataWithAttachment);

      expect(resendInbound.downloadAttachment).toHaveBeenCalledWith('email-abc123', 'att-id-1');
      expect(filterService.filter).toHaveBeenCalledWith(
        expect.objectContaining({
          fileName: 'ratecon.pdf',
          mimeType: 'application/pdf',
          fileSize: fakeBuffer.length,
        }),
      );
      expect(fileStorage.uploadBuffer).toHaveBeenCalled();
      expect(emailQueue.add).toHaveBeenCalled();
      // Phase 3 envelope: producer wraps payload + uses DOCUMENTS_JOB_NAMES.PARSE_ATTACHMENT.
      const addArgs = emailQueue.add.mock.calls[0];
      expect(addArgs[0]).toBe('parse-attachment');
      expect(addArgs[1]).toMatchObject({
        tenantId: '1',
        payload: expect.objectContaining({ attachmentId: 'db-att-1' }),
        metadata: expect.objectContaining({ source: 'webhook', version: 1 }),
      });
      expect(result.results[0].queued).toBe(true);
      expect(result.results[0].filterResult).toBe('PASSED');
    });

    it('should skip attachment download errors and continue', async () => {
      const dataWithAttachment: ResendInboundEmailDataDto = {
        ...webhookData,
        attachments: [
          {
            id: 'att-fail',
            filename: 'doc.pdf',
            content_type: 'application/pdf',
          },
        ],
      };

      (resendInbound.getEmail as jest.Mock).mockResolvedValue({
        id: 'email-abc123',
        text: null,
        html: null,
        headers: {},
        message_id: '<msg-123@example.com>',
      });
      (threadTracker.findOrCreateThread as jest.Mock).mockResolvedValue(baseThread);
      (prisma.emailIngestMessage.create as jest.Mock).mockResolvedValue(baseMessage);
      (resendInbound.downloadAttachment as jest.Mock).mockRejectedValue(
        new Error('Resend attachment download error: 404 Not Found'),
      );

      const result = await service.processInboundEmail(1, dataWithAttachment);

      expect(result.results).toHaveLength(0); // attachment skipped
    });

    it('should proceed with webhook data when Resend API fetch fails', async () => {
      (resendInbound.getEmail as jest.Mock).mockRejectedValue(new Error('Resend API error: 500 Internal Server Error'));
      (threadTracker.findOrCreateThread as jest.Mock).mockResolvedValue(baseThread);
      (prisma.emailIngestMessage.create as jest.Mock).mockResolvedValue(baseMessage);

      const result = await service.processInboundEmail(1, webhookData);

      // Should not throw — graceful degradation
      expect(result.threadId).toBe(1);
    });
  });

  describe('extractEmail', () => {
    it('should extract email from "Name <email>" format', () => {
      expect(extractEmail('John Doe <john@example.com>')).toBe('john@example.com');
    });

    it('should handle plain email', () => {
      expect(extractEmail('john@example.com')).toBe('john@example.com');
    });

    it('should lowercase the email', () => {
      expect(extractEmail('John@EXAMPLE.com')).toBe('john@example.com');
    });
  });

  describe('extractName', () => {
    it('should extract name from "Name <email>" format', () => {
      expect(extractName('John Doe <john@example.com>')).toBe('John Doe');
    });

    it('should strip quotes from name', () => {
      expect(extractName('"John Doe" <john@example.com>')).toBe('John Doe');
    });

    it('should return null for plain email', () => {
      expect(extractName('john@example.com')).toBeNull();
    });
  });

  describe('getSettings', () => {
    it('should return existing settings', async () => {
      const settings = { id: 's1', tenantId: 1, isEnabled: true };
      (prisma.emailIngestSettings.findUnique as jest.Mock).mockResolvedValue(settings);

      const result = await service.getSettings(1);

      expect(result).toEqual(settings);
    });

    it('should auto-provision when no settings found', async () => {
      (prisma.emailIngestSettings.findUnique as jest.Mock)
        .mockResolvedValueOnce(null) // getSettings check
        .mockResolvedValueOnce(null); // provisionSettings check
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({
        tenantId: 'demo',
        subdomain: 'demo-fleet',
      });
      const created = {
        id: 's-new',
        tenantId: 1,
        inboundAddress: 'loads-demo-fleet@inbound.sally.appshore.in',
      };
      (prisma.emailIngestSettings.create as jest.Mock).mockResolvedValue(created);

      const result = await service.getSettings(1);

      expect(result).toEqual(created);
    });
  });

  describe('updateSettings', () => {
    it('should update settings with partial data', async () => {
      const existing = { id: 's1', tenantId: 1, isEnabled: true };
      (prisma.emailIngestSettings.findUnique as jest.Mock).mockResolvedValue(existing);
      const updated = { ...existing, isEnabled: false };
      (prisma.emailIngestSettings.update as jest.Mock).mockResolvedValue(updated);

      const result = await service.updateSettings(1, { isEnabled: false });

      expect(result.isEnabled).toBe(false);
    });
  });

  describe('listThreads', () => {
    it('should return paginated threads', async () => {
      (prisma.emailIngestThread.findMany as jest.Mock).mockResolvedValue([{ id: 1 }]);
      (prisma.emailIngestThread.count as jest.Mock).mockResolvedValue(1);

      const result = await service.listThreads(1, { page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
    });

    it('should filter by status and sender', async () => {
      (prisma.emailIngestThread.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.emailIngestThread.count as jest.Mock).mockResolvedValue(0);

      await service.listThreads(1, {
        page: 1,
        limit: 20,
        status: 'PENDING',
        senderEmail: 'broker@test.com',
      } as any);

      expect(prisma.emailIngestThread.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'PENDING',
            senderEmail: expect.objectContaining({
              contains: 'broker@test.com',
            }),
          }),
        }),
      );
    });

    it('should filter by date range', async () => {
      (prisma.emailIngestThread.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.emailIngestThread.count as jest.Mock).mockResolvedValue(0);

      await service.listThreads(1, {
        page: 1,
        limit: 20,
        from: '2026-01-01',
        to: '2026-01-31',
      } as any);

      expect(prisma.emailIngestThread.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        }),
      );
    });
  });

  describe('getThread', () => {
    it('should return thread with messages', async () => {
      const thread = { id: 1, messages: [] };
      (prisma.emailIngestThread.findFirst as jest.Mock).mockResolvedValue(thread);

      const result = await service.getThread(1, 1);

      expect(result).toEqual(thread);
    });

    it('should throw NotFoundException when thread not found', async () => {
      (prisma.emailIngestThread.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.getThread(1, 999)).rejects.toThrow('not found');
    });
  });

  describe('confirmThread', () => {
    it('should confirm thread and record user', async () => {
      (prisma.emailIngestThread.findFirst as jest.Mock).mockResolvedValue({
        id: 1,
      });
      const confirmed = { id: 1, status: 'CONFIRMED' };
      (prisma.emailIngestThread.update as jest.Mock).mockResolvedValue(confirmed);

      const result = await service.confirmThread(1, 1, 42);

      expect(result.status).toBe('CONFIRMED');
      expect(prisma.emailIngestThread.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          status: 'CONFIRMED',
          confirmedById: 42,
        }),
      });
    });

    it('should throw when thread not found', async () => {
      (prisma.emailIngestThread.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.confirmThread(1, 999, 1)).rejects.toThrow('not found');
    });
  });

  describe('discardThread', () => {
    it('should discard thread', async () => {
      (prisma.emailIngestThread.findFirst as jest.Mock).mockResolvedValue({
        id: 1,
      });
      (prisma.emailIngestThread.update as jest.Mock).mockResolvedValue({
        id: 1,
        status: 'DISCARDED',
      });

      const result = await service.discardThread(1, 1);

      expect(result.status).toBe('DISCARDED');
    });
  });

  describe('restoreThread', () => {
    it('should restore a discarded thread to PENDING', async () => {
      (prisma.emailIngestThread.findFirst as jest.Mock).mockResolvedValue({
        id: 1,
        status: 'DISCARDED',
      });
      (prisma.emailIngestThread.update as jest.Mock).mockResolvedValue({
        id: 1,
        status: 'PENDING',
      });

      const result = await service.restoreThread(1, 1);

      expect(result.status).toBe('PENDING');
    });

    it('should throw when thread not found or not discarded', async () => {
      (prisma.emailIngestThread.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.restoreThread(1, 999)).rejects.toThrow('not found');
    });
  });

  describe('findCustomerByMc', () => {
    it('should return customer id when found', async () => {
      (prisma as any).customer = {
        findFirst: jest.fn().mockResolvedValue({ id: 5 }),
      };

      const result = await service.findCustomerByMc(1, 'MC-123');

      expect(result).toBe(5);
    });

    it('should return null when not found', async () => {
      (prisma as any).customer = {
        findFirst: jest.fn().mockResolvedValue(null),
      };

      const result = await service.findCustomerByMc(1, 'MC-NONE');

      expect(result).toBeNull();
    });
  });

  describe('findCustomerByName', () => {
    it('should return customer id when found', async () => {
      (prisma as any).customer = {
        findFirst: jest.fn().mockResolvedValue({ id: 10 }),
      };

      const result = await service.findCustomerByName(1, 'Acme Corp');

      expect(result).toBe(10);
    });
  });

  describe('getAttachment', () => {
    it('should return attachment with message', async () => {
      const att = { id: 100, message: { id: 10 } };
      (prisma.emailIngestAttachment.findFirst as jest.Mock).mockResolvedValue(att);

      const result = await service.getAttachment(1, 100);

      expect(result).toEqual(att);
    });

    it('should throw when not found', async () => {
      (prisma.emailIngestAttachment.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.getAttachment(1, 999)).rejects.toThrow('not found');
    });
  });

  describe('requeueAttachment', () => {
    it('should reset parse status and add to queue', async () => {
      (prisma.emailIngestAttachment.findFirst as jest.Mock).mockResolvedValue({
        id: 100,
        messageId: 10,
        s3Key: 'tenants/1/email-intake/...',
        fileName: 'doc.pdf',
        contentHash: 'abc123',
        message: { threadId: 1 },
      });
      (prisma.emailIngestAttachment.update as jest.Mock).mockResolvedValue({});

      const result = await service.requeueAttachment(1, 100);

      expect(result).toEqual({ requeued: true });
      expect(prisma.emailIngestAttachment.update).toHaveBeenCalledWith({
        where: { id: 100 },
        data: expect.objectContaining({
          parseStatus: 'PENDING',
          parsedData: null,
        }),
      });
      expect(emailQueue.add).toHaveBeenCalled();
    });

    it('should throw when attachment not found', async () => {
      (prisma.emailIngestAttachment.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.requeueAttachment(1, 999)).rejects.toThrow('not found');
    });
  });

  describe('approveSenderAndParse', () => {
    it('should approve sender domain and requeue attachments', async () => {
      const thread = {
        id: 1,
        senderEmail: 'broker@freight.com',
        messages: [
          {
            id: 10,
            attachments: [
              {
                id: 100,
                s3Key: 'tenants/1/email-intake/t1/msg-1/doc.pdf',
                fileName: 'doc.pdf',
                contentHash: 'abc',
                filterResult: 'SENDER_UNKNOWN',
              },
            ],
          },
        ],
      };

      (prisma.emailIngestThread.findFirst as jest.Mock).mockResolvedValue(thread);
      (prisma.emailIngestSettings.findUnique as jest.Mock).mockResolvedValue({
        tenantId: 1,
        approvedDomains: ['existing.com'],
      });
      (prisma.emailIngestSettings.update as jest.Mock).mockResolvedValue({});
      (prisma.emailIngestAttachment.update as jest.Mock).mockResolvedValue({});

      const result = await service.approveSenderAndParse(1, 1);

      expect(result.status).toBe('approved');
      expect(result.domain).toBe('freight.com');
      expect(result.requeuedCount).toBe(1);
      expect(prisma.emailIngestSettings.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            approvedDomains: ['existing.com', 'freight.com'],
          },
        }),
      );
      expect(emailQueue.add).toHaveBeenCalled();
    });

    it('should throw NotFoundException when thread not found', async () => {
      (prisma.emailIngestThread.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.approveSenderAndParse(1, 999)).rejects.toThrow('not found');
    });

    it('should not add domain if already approved', async () => {
      const thread = {
        id: 1,
        senderEmail: 'broker@existing.com',
        messages: [],
      };

      (prisma.emailIngestThread.findFirst as jest.Mock).mockResolvedValue(thread);
      (prisma.emailIngestSettings.findUnique as jest.Mock).mockResolvedValue({
        tenantId: 1,
        approvedDomains: ['existing.com'],
      });

      const result = await service.approveSenderAndParse(1, 1);

      expect(result.requeuedCount).toBe(0);
      expect(prisma.emailIngestSettings.update).not.toHaveBeenCalled();
    });
  });

  describe('linkLoadToThread', () => {
    it('should update thread with confirmedLoadId', async () => {
      (prisma.emailIngestThread.update as jest.Mock).mockResolvedValue({
        id: 1,
        confirmedLoadId: 'load-123',
      });

      const result = await service.linkLoadToThread(1, 'load-123');

      expect(result.confirmedLoadId).toBe('load-123');
      expect(prisma.emailIngestThread.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { confirmedLoadId: 'load-123' },
      });
    });
  });

  describe('processInboundEmail — inline attachment content', () => {
    it('should process inline base64 attachment content', async () => {
      const baseThread = {
        id: 1,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      };
      const baseMessage = { id: 10, threadId: 1 };

      const webhookData = {
        email_id: 'email-123',
        from: 'broker@example.com',
        to: ['loads-demo@inbound.sally.appshore.in'],
        subject: 'RC',
        message_id: '<msg-123>',
        attachments: [
          {
            id: null,
            filename: 'ratecon.pdf',
            content_type: 'application/pdf',
            content: Buffer.from('fake-pdf').toString('base64'),
          },
        ],
      };

      (resendInbound.getEmail as jest.Mock).mockResolvedValue({
        id: 'email-123',
        text: 'Test',
        html: null,
        headers: {},
        message_id: '<msg-123>',
      });
      (threadTracker.findOrCreateThread as jest.Mock).mockResolvedValue(baseThread);
      (prisma.emailIngestMessage.create as jest.Mock).mockResolvedValue(baseMessage);
      (filterService.filter as jest.Mock).mockResolvedValue({
        result: 'REJECTED',
        reason: 'Not a rate con',
      });
      (fileStorage.uploadBuffer as jest.Mock).mockResolvedValue(undefined);
      (prisma.emailIngestAttachment.create as jest.Mock).mockResolvedValue({
        id: 100,
      });

      const result = await service.processInboundEmail(1, webhookData as any);

      expect(result.results[0].filterResult).toBe('REJECTED');
      expect(result.results[0].queued).toBe(false);
    });
  });
});
