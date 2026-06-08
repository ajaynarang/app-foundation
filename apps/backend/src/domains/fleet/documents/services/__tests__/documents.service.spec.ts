import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DocumentsService } from '../documents.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { DomainEventService } from '../../../../../infrastructure/events/domain-event.service';
import { FileStorageService } from '../../../../../infrastructure/storage/file-storage.service';
import { BillingReadinessService } from '../../../../financials/close-out/billing-readiness.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('DocumentsService', () => {
  let service: DocumentsService;
  let prisma: {
    document: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      count: jest.Mock;
    };
    loadStop: { update: jest.Mock };
  };
  let fileStorage: {
    generateS3Key: jest.Mock;
    generatePresignedUploadUrl: jest.Mock;
    generatePresignedDownloadUrl: jest.Mock;
    deleteObject: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      document: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
      },
      loadStop: { update: jest.fn() },
    };

    fileStorage = {
      generateS3Key: jest.fn().mockReturnValue('tenants/1/documents/load/1/uuid_file.pdf'),
      generatePresignedUploadUrl: jest.fn().mockResolvedValue('https://s3.amazonaws.com/presigned-upload'),
      generatePresignedDownloadUrl: jest.fn().mockResolvedValue('https://s3.amazonaws.com/presigned-download'),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: DomainEventService,
          useValue: { emit: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: FileStorageService, useValue: fileStorage },
        {
          provide: BillingReadinessService,
          useValue: { evaluate: jest.fn() },
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn(), emitAsync: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<DocumentsService>(DocumentsService);
  });

  describe('presignUpload', () => {
    it('should create a pending document and return presigned URL', async () => {
      prisma.document.create.mockResolvedValue({
        id: 1,
        status: 'PENDING_UPLOAD',
        s3Key: 'tenants/1/documents/load/1/uuid_file.pdf',
      });

      const result = await service.presignUpload({
        tenantId: 1,
        entityType: 'load',
        entityId: 1,
        documentType: 'rate_confirmation',
        fileName: 'ratecon.pdf',
        mimeType: 'application/pdf',
        fileSize: 245000,
      });

      expect(result.documentId).toBe(1);
      expect(result.uploadUrl).toBe('https://s3.amazonaws.com/presigned-upload');
      expect(result.s3Key).toContain('tenants/1/documents/load/1/');
      expect(prisma.document.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'PENDING_UPLOAD',
          entityType: 'load',
          entityId: 1,
          documentType: 'rate_confirmation',
        }),
      });
    });
  });

  describe('confirmUpload', () => {
    it('should mark document as confirmed', async () => {
      prisma.document.findUnique.mockResolvedValue({
        id: 1,
        status: 'PENDING_UPLOAD',
        tenantId: 1,
      });
      prisma.document.update.mockResolvedValue({
        id: 1,
        status: 'CONFIRMED',
      });

      await service.confirmUpload(1, 1);

      expect(prisma.document.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 'CONFIRMED' },
      });
    });

    it('should throw NotFoundException for missing document', async () => {
      prisma.document.findUnique.mockResolvedValue(null);

      await expect(service.confirmUpload(999, 1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('listDocuments', () => {
    it('should return confirmed documents for an entity', async () => {
      const docs = [
        {
          id: 1,
          entityType: 'load',
          entityId: 1,
          documentType: 'bol',
          fileName: 'bol.pdf',
          fileUrl: '',
          fileSize: 1024,
          mimeType: 'application/pdf',
          s3Key: 'tenants/1/documents/load/1/bol.pdf',
          status: 'CONFIRMED',
          description: null,
          relatedStopId: null,
          uploadedBy: null,
          tenantId: 1,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        },
      ];
      prisma.document.findMany.mockResolvedValue(docs);

      const result = await service.listDocuments('load', 1, 1);

      expect(prisma.document.findMany).toHaveBeenCalledWith({
        where: {
          entityType: 'load',
          entityId: 1,
          tenantId: 1,
          status: 'CONFIRMED',
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(result[0]).toEqual(
        expect.objectContaining({
          id: 1,
          documentType: 'bol',
          entityType: 'load',
          fileName: 'bol.pdf',
          status: 'CONFIRMED',
        }),
      );
    });
  });

  describe('presignUpload - validation', () => {
    it('should throw BadRequestException for unsupported mime type', async () => {
      await expect(
        service.presignUpload({
          tenantId: 1,
          entityType: 'load',
          entityId: 1,
          documentType: 'rate_confirmation',
          fileName: 'file.zip',
          mimeType: 'application/zip',
          fileSize: 1024,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for oversized file', async () => {
      await expect(
        service.presignUpload({
          tenantId: 1,
          entityType: 'load',
          entityId: 1,
          documentType: 'rate_confirmation',
          fileName: 'huge.pdf',
          mimeType: 'application/pdf',
          fileSize: 20 * 1024 * 1024,
        }),
      ).rejects.toThrow('File too large');
    });

    it('should accept image/jpeg files', async () => {
      prisma.document.create.mockResolvedValue({
        id: 2,
        status: 'PENDING_UPLOAD',
      });

      const result = await service.presignUpload({
        tenantId: 1,
        entityType: 'load',
        entityId: 1,
        documentType: 'BOL',
        fileName: 'photo.jpg',
        mimeType: 'image/jpeg',
        fileSize: 2048,
      });

      expect(result.documentId).toBe(2);
    });
  });

  describe('confirmUpload - BOL/POD handling', () => {
    it('should update bolNumber when confirming BOL on load_stop', async () => {
      prisma.document.findUnique.mockResolvedValue({
        id: 5,
        status: 'PENDING_UPLOAD',
        tenantId: 1,
        entityType: 'load_stop',
        entityId: 10,
        relatedStopId: 20,
        documentType: 'BOL',
      });
      prisma.document.update.mockResolvedValue({
        id: 5,
        status: 'CONFIRMED',
        entityType: 'load_stop',
        entityId: 10,
        relatedStopId: 20,
        documentType: 'BOL',
        fileName: 'bol.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        s3Key: 'key',
        description: null,
        createdAt: new Date(),
      });
      (prisma as any).loadStop = {
        ...(prisma as any).loadStop,
        updateMany: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue({
          load: {
            loadNumber: 'LD-001',
            tenantId: 1,
            billingStatus: 'PENDING_DOCUMENTS',
          },
        }),
      };

      await service.confirmUpload(5, 1);

      expect((prisma as any).loadStop.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { bolNumber: 'DOC-5' },
        }),
      );
    });

    it('should update podSignedBy when confirming POD on load_stop', async () => {
      prisma.document.findUnique.mockResolvedValue({
        id: 6,
        status: 'PENDING_UPLOAD',
        tenantId: 1,
        entityType: 'load_stop',
        entityId: 10,
        relatedStopId: 20,
        documentType: 'pod',
      });
      prisma.document.update.mockResolvedValue({
        id: 6,
        status: 'CONFIRMED',
        entityType: 'load_stop',
        entityId: 10,
        relatedStopId: 20,
        documentType: 'pod',
        fileName: 'pod.jpg',
        fileSize: 2048,
        mimeType: 'image/jpeg',
        s3Key: 'key2',
        description: null,
        createdAt: new Date(),
      });
      (prisma as any).loadStop = {
        ...(prisma as any).loadStop,
        updateMany: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue({
          load: {
            loadNumber: 'LD-001',
            tenantId: 1,
            billingStatus: 'READY_FOR_REVIEW',
          },
        }),
      };

      await service.confirmUpload(6, 1);

      expect((prisma as any).loadStop.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { podSignedBy: 'Driver (uploaded)' },
        }),
      );
    });

    it('should throw when already confirmed', async () => {
      prisma.document.findUnique.mockResolvedValue({
        id: 1,
        status: 'CONFIRMED',
        tenantId: 1,
        entityType: 'load',
        entityId: 1,
      });

      await expect(service.confirmUpload(1, 1)).rejects.toThrow(BadRequestException);
    });

    it('should throw when wrong tenant', async () => {
      prisma.document.findUnique.mockResolvedValue({
        id: 1,
        status: 'PENDING_UPLOAD',
        tenantId: 2,
      });

      await expect(service.confirmUpload(1, 1)).rejects.toThrow(NotFoundException);
    });

    it('should evaluate billing readiness for load entity type', async () => {
      prisma.document.findUnique.mockResolvedValue({
        id: 7,
        status: 'PENDING_UPLOAD',
        tenantId: 1,
        entityType: 'load',
        entityId: 100,
        relatedStopId: null,
        documentType: 'bol',
      });
      prisma.document.update.mockResolvedValue({
        id: 7,
        status: 'CONFIRMED',
        entityType: 'load',
        entityId: 100,
        documentType: 'bol',
        fileName: 'bol.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        s3Key: 'key',
        description: null,
        createdAt: new Date(),
        relatedStopId: null,
      });
      (prisma as any).load = {
        findFirst: jest.fn().mockResolvedValue({
          id: 100,
          loadNumber: 'LD-100',
          tenantId: 1,
          billingStatus: 'PENDING_DOCUMENTS',
        }),
      };

      await service.confirmUpload(7, 1);

      // Should have evaluated billing readiness
    });
  });

  describe('getDownloadUrl', () => {
    it('should return presigned download URL', async () => {
      prisma.document.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 1,
        status: 'CONFIRMED',
        s3Key: 'tenants/1/docs/file.pdf',
        entityType: 'load',
        entityId: 1,
      });

      const url = await service.getDownloadUrl(1, 1);

      expect(url).toBe('https://s3.amazonaws.com/presigned-download');
    });

    it('should throw BadRequestException when no S3 key', async () => {
      prisma.document.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 1,
        status: 'CONFIRMED',
        s3Key: null,
        entityType: 'load',
        entityId: 1,
      });

      await expect(service.getDownloadUrl(1, 1)).rejects.toThrow('no S3 key');
    });

    it('should throw NotFoundException for deleted document', async () => {
      prisma.document.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 1,
        status: 'DELETED',
      });

      await expect(service.getDownloadUrl(1, 1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteDocument', () => {
    it('should soft-delete document without removing S3 object', async () => {
      prisma.document.findUnique.mockResolvedValue({
        id: 1,
        s3Key: 'tenants/1/documents/load/1/file.pdf',
        tenantId: 1,
        status: 'CONFIRMED',
      });
      prisma.document.update.mockResolvedValue({ id: 1, status: 'DELETED' });

      await service.deleteDocument(1, 1);

      expect(prisma.document.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 'DELETED' },
      });
      // S3 objects are retained on soft-delete for audit/recovery
      expect(fileStorage.deleteObject).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException for already deleted document', async () => {
      prisma.document.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 1,
        status: 'DELETED',
      });

      await expect(service.deleteDocument(1, 1)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for wrong tenant', async () => {
      prisma.document.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 2,
        status: 'CONFIRMED',
      });

      await expect(service.deleteDocument(1, 1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getDocument', () => {
    it('should return formatted document', async () => {
      prisma.document.findUnique.mockResolvedValue({
        id: 1,
        entityType: 'load',
        entityId: 1,
        documentType: 'BOL',
        fileName: 'bol.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        s3Key: 'key',
        status: 'CONFIRMED',
        description: 'Test doc',
        createdAt: new Date(),
        relatedStopId: null,
        tenantId: 1,
      });

      const result = await service.getDocument(1, 1);

      expect(result.id).toBe(1);
      expect(result.documentType).toBe('BOL');
    });

    it('should throw NotFoundException for non-existent document', async () => {
      prisma.document.findUnique.mockResolvedValue(null);

      await expect(service.getDocument(999, 1)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── createConfirmed ───────────────────────────────

  describe('createConfirmed', () => {
    it('should create a confirmed document directly', async () => {
      prisma.document.create.mockResolvedValue({
        id: 10,
        entityType: 'load',
        entityId: 1,
        documentType: 'BOL',
        fileName: 'bol.pdf',
        fileUrl: '',
        fileSize: 1024,
        mimeType: 'application/pdf',
        s3Key: 'tenants/1/bol.pdf',
        status: 'CONFIRMED',
        description: 'Auto-generated BOL',
        createdAt: new Date(),
        relatedStopId: null,
        tenantId: 1,
        uploadedBy: 5,
      });

      const result = await service.createConfirmed({
        tenantId: 1,
        entityType: 'load',
        entityId: 1,
        documentType: 'BOL',
        fileName: 'bol.pdf',
        s3Key: 'tenants/1/bol.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        uploadedBy: 5,
        description: 'Auto-generated BOL',
      });

      expect(prisma.document.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          entityType: 'load',
          entityId: 1,
          documentType: 'BOL',
          status: 'CONFIRMED',
          uploadedBy: 5,
          description: 'Auto-generated BOL',
        }),
      });
      expect(result.id).toBe(10);
    });

    it('should default optional fields to null', async () => {
      prisma.document.create.mockResolvedValue({
        id: 11,
        entityType: 'load',
        entityId: 1,
        documentType: 'OTHER',
        fileName: 'test.pdf',
        fileUrl: '',
        fileSize: 512,
        mimeType: 'application/pdf',
        s3Key: 'key',
        status: 'CONFIRMED',
        description: null,
        createdAt: new Date(),
        relatedStopId: null,
        tenantId: 1,
        uploadedBy: null,
      });

      await service.createConfirmed({
        tenantId: 1,
        entityType: 'load',
        entityId: 1,
        documentType: 'OTHER',
        fileName: 'test.pdf',
        s3Key: 'key',
        fileSize: 512,
        mimeType: 'application/pdf',
      });

      expect(prisma.document.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          uploadedBy: null,
          description: null,
          relatedStopId: null,
        }),
      });
    });
  });

  // ─── cleanupExpiredUploads ─────────────────────────────────

  describe('cleanupExpiredUploads', () => {
    it('should expire old pending uploads and return count', async () => {
      prisma.document.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.cleanupExpiredUploads();

      expect(prisma.document.updateMany).toHaveBeenCalledWith({
        where: {
          status: 'PENDING_UPLOAD',
          createdAt: { lt: expect.any(Date) },
        },
        data: { status: 'EXPIRED' },
      });
      expect(result).toBe(3);
    });

    it('should return 0 when no expired uploads', async () => {
      prisma.document.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.cleanupExpiredUploads();
      expect(result).toBe(0);
    });
  });

  // ─── Driver document access control ──────────────────────────

  describe('driver document access', () => {
    it('should allow non-driver callers to access any document type', async () => {
      prisma.document.findMany.mockResolvedValue([]);

      // Non-driver caller (dispatcher) should not throw
      const result = await service.listDocuments('vehicle', 1, 1, {
        callerRole: 'DISPATCHER',
      });

      expect(result).toEqual([]);
    });

    it('should throw ForbiddenException when driver accesses non-load document', async () => {
      await expect(
        service.listDocuments('vehicle', 1, 1, {
          callerRole: 'DRIVER',
          callerDriverId: 5,
        }),
      ).rejects.toThrow('Drivers can only access documents for loads');
    });

    it('should throw NotFoundException when driver load is not found', async () => {
      (prisma as any).load = {
        findFirst: jest.fn().mockResolvedValue(null),
      };

      await expect(
        service.listDocuments('load', 99, 1, {
          callerRole: 'DRIVER',
          callerDriverId: 5,
        }),
      ).rejects.toThrow('Load not found');
    });

    it('should throw ForbiddenException when driver is not assigned to load', async () => {
      (prisma as any).load = {
        findFirst: jest.fn().mockResolvedValue({
          id: 1,
          driverId: 99, // different driver
          isRelay: false,
        }),
      };

      await expect(
        service.listDocuments('load', 1, 1, {
          callerRole: 'DRIVER',
          callerDriverId: 5,
        }),
      ).rejects.toThrow('Drivers can only access documents for their own loads');
    });

    it('should allow driver on relay load via leg assignment', async () => {
      (prisma as any).load = {
        findFirst: jest.fn().mockResolvedValue({
          id: 1,
          driverId: null,
          isRelay: true,
        }),
      };
      (prisma as any).loadLeg = {
        findFirst: jest.fn().mockResolvedValue({ id: 1, driverId: 5 }),
      };
      prisma.document.findMany.mockResolvedValue([]);

      const result = await service.listDocuments('load', 1, 1, {
        callerRole: 'DRIVER',
        callerDriverId: 5,
      });

      expect(result).toEqual([]);
    });

    it('should throw ForbiddenException when relay driver not on any leg', async () => {
      (prisma as any).load = {
        findFirst: jest.fn().mockResolvedValue({
          id: 1,
          driverId: null,
          isRelay: true,
        }),
      };
      (prisma as any).loadLeg = {
        findFirst: jest.fn().mockResolvedValue(null),
      };

      await expect(
        service.listDocuments('load', 1, 1, {
          callerRole: 'DRIVER',
          callerDriverId: 5,
        }),
      ).rejects.toThrow('Drivers can only access documents for their own loads');
    });

    it('should allow driver access for load_stop entity type', async () => {
      (prisma as any).load = {
        findFirst: jest.fn().mockResolvedValue({
          id: 1,
          driverId: 5,
          isRelay: false,
        }),
      };
      prisma.document.findMany.mockResolvedValue([]);

      const result = await service.listDocuments('load_stop', 10, 1, {
        callerRole: 'DRIVER',
        callerDriverId: 5,
      });

      expect(result).toEqual([]);
    });
  });

  // ─── presignUpload with relatedStopId ─────────────────────────

  describe('presignUpload with relatedStopId', () => {
    it('should include relatedStopId and description in document creation', async () => {
      prisma.document.create.mockResolvedValue({
        id: 3,
        status: 'PENDING_UPLOAD',
        s3Key: 'test-key',
      });

      await service.presignUpload({
        tenantId: 1,
        entityType: 'load_stop',
        entityId: 10,
        documentType: 'BOL',
        fileName: 'bol.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        relatedStopId: 20,
        description: 'BOL for pickup',
        uploadedBy: 5,
      });

      expect(prisma.document.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          relatedStopId: 20,
          description: 'BOL for pickup',
          uploadedBy: 5,
        }),
      });
    });
  });
});
