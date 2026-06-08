import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { DocumentStatusSchema } from '@sally/shared-types';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';
import { FileStorageService } from '../../../../infrastructure/storage/file-storage.service';
import { BillingReadinessService } from '../../../financials/close-out/billing-readiness.service';

const DOCUMENT_STATUS = DocumentStatusSchema.enum;

interface CallerContext {
  callerRole?: string;
  callerDriverId?: number;
}

const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/tiff', 'image/heic'];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fileStorage: FileStorageService,
    private readonly billingReadiness: BillingReadinessService,
    private readonly events: DomainEventService,
  ) {}

  async presignUpload(params: {
    tenantId: number;
    entityType: string;
    entityId: number;
    documentType: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
    relatedStopId?: number;
    description?: string;
    uploadedBy?: number;
    callerRole?: string;
    callerDriverId?: number;
  }) {
    if (!ALLOWED_MIME_TYPES.includes(params.mimeType)) {
      throw new BadRequestException(
        `Unsupported file type: ${params.mimeType}. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
      );
    }
    if (params.fileSize > MAX_FILE_SIZE) {
      throw new BadRequestException(`File too large: ${params.fileSize} bytes. Max: ${MAX_FILE_SIZE} bytes (10 MB)`);
    }

    await this.assertDriverDocumentAccess(
      { entityType: params.entityType, entityId: params.entityId },
      params.tenantId,
      { callerRole: params.callerRole, callerDriverId: params.callerDriverId },
    );

    const s3Key = this.fileStorage.generateS3Key({
      tenantId: params.tenantId,
      entityType: params.entityType,
      entityId: params.entityId,
      fileName: params.fileName,
    });

    const doc = await this.prisma.document.create({
      data: {
        entityType: params.entityType,
        entityId: params.entityId,
        documentType: params.documentType,
        fileName: params.fileName,
        fileUrl: '',
        fileSize: params.fileSize,
        mimeType: params.mimeType,
        s3Key,
        status: DOCUMENT_STATUS.PENDING_UPLOAD,
        relatedStopId: params.relatedStopId ?? null,
        description: params.description ?? null,
        uploadedBy: params.uploadedBy ?? null,
        tenantId: params.tenantId,
      },
    });

    const uploadUrl = await this.fileStorage.generatePresignedUploadUrl(s3Key, params.mimeType);

    return {
      documentId: doc.id,
      uploadUrl: uploadUrl,
      s3Key: s3Key,
      expiresIn: 300,
    };
  }

  async confirmUpload(documentId: number, tenantId: number, caller?: CallerContext) {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!doc || doc.tenantId !== tenantId) {
      throw new NotFoundException(`Document ${documentId} not found`);
    }

    await this.assertDriverDocumentAccess(doc, tenantId, caller);

    if (doc.status !== DOCUMENT_STATUS.PENDING_UPLOAD) {
      throw new BadRequestException(`Document ${documentId} is already ${doc.status}`);
    }

    const confirmed = await this.prisma.document.update({
      where: { id: documentId },
      data: { status: DOCUMENT_STATUS.CONFIRMED },
    });

    // If this is a BOL/POD document for a load stop, mark the stop as having the doc.
    // This bridges driver photo uploads with the bolNumber/podSignedBy fields that
    // the rest of the system (timeline badges, completion card) relies on.
    if (doc.entityType === 'load_stop' && doc.relatedStopId) {
      const docType = (doc.documentType ?? '').toLowerCase();
      if (docType === 'bol') {
        await this.prisma.loadStop.updateMany({
          where: { id: doc.relatedStopId },
          data: { bolNumber: `DOC-${confirmed.id}` },
        });
      } else if (docType === 'pod') {
        await this.prisma.loadStop.updateMany({
          where: { id: doc.relatedStopId },
          data: { podSignedBy: 'Driver (uploaded)' },
        });
      }
    }

    // Re-evaluate billing readiness when docs are uploaded for a load or load_stop.
    // BillingReadinessService.evaluate() handles auto-transition between
    // PENDING_DOCUMENTS <-> READY_FOR_REVIEW based on tenant operations settings.
    if (doc.entityType === 'load') {
      const load = await this.prisma.load.findFirst({
        where: { id: doc.entityId },
      });
      if (load && load.billingStatus === 'PENDING_DOCUMENTS') {
        await this.billingReadiness.evaluate(load.loadNumber, load.tenantId);
      }
    } else if (doc.entityType === 'load_stop' && doc.relatedStopId) {
      // Find the load via the stop
      const loadStop = await this.prisma.loadStop.findUnique({
        where: { id: doc.relatedStopId },
        select: {
          load: {
            select: { loadNumber: true, tenantId: true, billingStatus: true },
          },
        },
      });
      if (loadStop?.load?.billingStatus === 'PENDING_DOCUMENTS') {
        await this.billingReadiness.evaluate(loadStop.load.loadNumber, loadStop.load.tenantId);
      }
    }

    await this.events.emit(SALLY_EVENTS.DOCUMENT_UPLOADED, tenantId, {
      entityId: String(confirmed.id),
      entityType: 'document',
      documentType: confirmed.documentType,
      loadDbId: doc.entityType === 'load' ? doc.entityId : undefined,
      fileName: confirmed.fileName,
    });

    return this.formatDocumentResponse(confirmed);
  }

  async listDocuments(entityType: string, entityId: number, tenantId: number, caller?: CallerContext) {
    await this.assertDriverDocumentAccess({ entityType, entityId }, tenantId, caller);

    const docs = await this.prisma.document.findMany({
      where: {
        entityType,
        entityId,
        tenantId,
        status: DOCUMENT_STATUS.CONFIRMED,
      },
      orderBy: { createdAt: 'desc' },
    });
    return docs.map((d) => this.formatDocumentResponse(d));
  }

  async getDocument(documentId: number, tenantId: number, caller?: CallerContext) {
    const doc = await this.getRawDocument(documentId, tenantId);
    await this.assertDriverDocumentAccess(doc, tenantId, caller);
    return this.formatDocumentResponse(doc);
  }

  private async getRawDocument(documentId: number, tenantId: number) {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!doc || doc.tenantId !== tenantId || doc.status === DOCUMENT_STATUS.DELETED) {
      throw new NotFoundException(`Document ${documentId} not found`);
    }

    return doc;
  }

  async getDownloadUrl(documentId: number, tenantId: number, caller?: CallerContext): Promise<string> {
    const doc = await this.getRawDocument(documentId, tenantId);
    await this.assertDriverDocumentAccess(doc, tenantId, caller);

    if (!doc.s3Key) {
      throw new BadRequestException('Document has no S3 key');
    }

    return this.fileStorage.generatePresignedDownloadUrl(doc.s3Key);
  }

  async deleteDocument(documentId: number, tenantId: number) {
    const doc = await this.getRawDocument(documentId, tenantId);

    await this.prisma.document.update({
      where: { id: documentId },
      data: { status: DOCUMENT_STATUS.DELETED },
    });
    // S3 objects are retained on soft-delete for audit/recovery.
    // A separate cleanup job should purge S3 objects for records
    // that have been soft-deleted for more than 30 days.

    await this.events.emit(SALLY_EVENTS.DOCUMENT_DELETED, tenantId, {
      entityId: String(doc.id),
      entityType: 'document',
      documentType: doc.documentType,
    });
  }

  async createConfirmed(params: {
    tenantId: number;
    entityType: string;
    entityId: number;
    documentType: string;
    fileName: string;
    s3Key: string;
    fileSize: number;
    mimeType: string;
    uploadedBy?: number;
    relatedStopId?: number;
    description?: string;
  }) {
    const doc = await this.prisma.document.create({
      data: {
        entityType: params.entityType,
        entityId: params.entityId,
        documentType: params.documentType,
        fileName: params.fileName,
        fileUrl: '',
        fileSize: params.fileSize,
        mimeType: params.mimeType,
        s3Key: params.s3Key,
        status: DOCUMENT_STATUS.CONFIRMED,
        relatedStopId: params.relatedStopId ?? null,
        description: params.description ?? null,
        uploadedBy: params.uploadedBy ?? null,
        tenantId: params.tenantId,
      },
    });
    return this.formatDocumentResponse(doc);
  }

  async cleanupExpiredUploads(): Promise<number> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const result = await this.prisma.document.updateMany({
      where: {
        status: DOCUMENT_STATUS.PENDING_UPLOAD,
        createdAt: { lt: oneHourAgo },
      },
      data: { status: DOCUMENT_STATUS.EXPIRED },
    });

    if (result.count > 0) {
      this.logger.log(`Cleaned up ${result.count} expired pending uploads`);
    }

    return result.count;
  }

  /**
   * Verify a DRIVER caller owns the load associated with a document.
   * Non-driver callers pass through without checks.
   */
  private async assertDriverDocumentAccess(
    doc: { entityType: string; entityId: number },
    tenantId: number,
    caller?: CallerContext,
  ) {
    if (caller?.callerRole !== 'DRIVER') return;

    if (!['load', 'load_stop'].includes(doc.entityType)) {
      throw new ForbiddenException('Drivers can only access documents for loads and load stops');
    }

    const load =
      doc.entityType === 'load'
        ? await this.prisma.load.findFirst({
            where: { id: doc.entityId, tenantId },
          })
        : await this.prisma.load.findFirst({
            where: {
              tenantId,
              stops: { some: { id: doc.entityId } },
            },
          });

    if (!load) {
      throw new NotFoundException('Load not found');
    }

    // Relay loads: check if driver is assigned to any leg
    if (load.isRelay) {
      const isLegDriver = await this.prisma.loadLeg.findFirst({
        where: { loadId: load.id, driverId: caller.callerDriverId },
      });
      if (!isLegDriver) {
        throw new ForbiddenException('Drivers can only access documents for their own loads');
      }
      return;
    }

    if (!caller.callerDriverId || load.driverId !== caller.callerDriverId) {
      throw new ForbiddenException('Drivers can only access documents for their own loads');
    }
  }

  private formatDocumentResponse(doc: any) {
    return {
      id: doc.id,
      entityType: doc.entityType,
      entityId: doc.entityId,
      documentType: doc.documentType,
      fileName: doc.fileName,
      fileUrl: doc.fileUrl ?? '',
      fileSize: doc.fileSize ?? null,
      mimeType: doc.mimeType ?? null,
      s3Key: doc.s3Key ?? null,
      status: doc.status,
      description: doc.description ?? null,
      relatedStopId: doc.relatedStopId ?? null,
      uploadedBy: doc.uploadedBy ?? null,
      tenantId: doc.tenantId,
      createdAt: doc.createdAt?.toISOString?.() ?? doc.createdAt,
      updatedAt: doc.updatedAt?.toISOString?.() ?? doc.updatedAt,
    };
  }
}
