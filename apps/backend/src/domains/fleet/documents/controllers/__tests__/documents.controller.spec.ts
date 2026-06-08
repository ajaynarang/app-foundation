import { Test } from '@nestjs/testing';
import { DocumentsController } from '../documents.controller';
import { DocumentsService } from '../../services/documents.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

describe('DocumentsController', () => {
  let controller: DocumentsController;
  let service: any;

  const mockUser = {
    tenantId: 'tenant-1',
    dbId: 42,
    role: 'DISPATCHER',
    driverDbId: undefined,
  };

  beforeEach(async () => {
    service = {
      presignUpload: jest.fn().mockResolvedValue({ uploadUrl: 'https://s3/upload', documentId: 1 }),
      confirmUpload: jest.fn().mockResolvedValue({ confirmed: true }),
      listDocuments: jest.fn().mockResolvedValue([]),
      getDocument: jest.fn().mockResolvedValue({ id: 1 }),
      getDownloadUrl: jest.fn().mockResolvedValue('https://s3/download'),
      deleteDocument: jest.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      controllers: [DocumentsController],
      providers: [
        { provide: DocumentsService, useValue: service },
        {
          provide: PrismaService,
          useValue: {
            tenant: { findUnique: jest.fn().mockResolvedValue({ id: 1 }) },
          },
        },
      ],
    }).compile();

    controller = module.get(DocumentsController);
  });

  it('should presign upload', async () => {
    const dto = {
      entityType: 'load',
      entityId: '1',
      documentType: 'BOL',
      fileName: 'doc.pdf',
      mimeType: 'application/pdf',
      fileSize: 1024,
    } as any;
    const result = await controller.presignUpload(mockUser, dto);
    expect(result.uploadUrl).toBeDefined();
  });

  it('should confirm upload', async () => {
    await controller.confirmUpload(mockUser, 1);
    expect(service.confirmUpload).toHaveBeenCalledWith(1, 1, {
      callerRole: 'DISPATCHER',
      callerDriverId: undefined,
    });
  });

  it('should list documents', async () => {
    await controller.listDocuments(mockUser, 'load', 1);
    expect(service.listDocuments).toHaveBeenCalledWith('load', 1, 1, {
      callerRole: 'DISPATCHER',
      callerDriverId: undefined,
    });
  });

  it('should get document', async () => {
    await controller.getDocument(mockUser, 1);
    expect(service.getDocument).toHaveBeenCalledWith(1, 1, {
      callerRole: 'DISPATCHER',
      callerDriverId: undefined,
    });
  });

  it('should get download URL', async () => {
    const result = await controller.getDownloadUrl(mockUser, 1);
    expect(result).toEqual({ downloadUrl: 'https://s3/download' });
  });

  it('should delete document', async () => {
    const result = await controller.deleteDocument(mockUser, 1);
    expect(result).toEqual({ deleted: true });
  });
});
