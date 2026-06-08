import { z } from 'zod';
import { DocumentStatus, DocumentStatusSchema } from '../generated/prisma-enums';

/**
 * Document upload lifecycle. Re-exported from the codegen mirror — Prisma
 * `DocumentStatus` enum is the single source of truth.
 * - PENDING_UPLOAD — presigned URL issued, S3 upload not yet confirmed.
 * - CONFIRMED      — S3 upload confirmed, document is usable.
 * - EXPIRED        — presign window elapsed without confirmation.
 * - DELETED        — soft-deleted by user/system.
 */
export { DocumentStatus, DocumentStatusSchema };

export const DocumentSchema = z.object({
  id: z.number(),
  documentId: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
  fileSize: z.number(),
  entityType: z.string(),
  entityId: z.string(),
  documentType: z.string().optional(),
  relatedStopId: z.string().optional(),
  bolNumber: z.string().optional(),
  uploadedBy: z.string().optional(),
  url: z.string().optional(),
  createdAt: z.string().optional(),
});

export const PresignUploadSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  fileSize: z.number().positive(),
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  documentType: z.string().optional(),
  relatedStopId: z.string().optional(),
  bolNumber: z.string().optional(),
});

export const DocumentTypeOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
});

export const PresignUploadRequestSchema = z.object({
  fileName: z.string(),
  mimeType: z.string(),
  fileSize: z.number(),
  entityType: z.string(),
  entityId: z.string(),
  documentType: z.string(),
  relatedStopId: z.string().optional(),
  description: z.string().optional(),
  bolNumber: z.string().optional(),
});

export const PresignUploadResponseSchema = z.object({
  documentId: z.number(),
  uploadUrl: z.string(),
  s3Key: z.string(),
  expiresIn: z.number(),
});

export type Document = z.infer<typeof DocumentSchema>;
export type PresignUploadInput = z.infer<typeof PresignUploadSchema>;
export type DocumentTypeOption = z.infer<typeof DocumentTypeOptionSchema>;
export type PresignUploadRequest = z.infer<typeof PresignUploadRequestSchema>;
export type PresignUploadResponse = z.infer<typeof PresignUploadResponseSchema>;

// Re-export document types registry
export {
  DOCUMENT_TYPES,
  getDocumentTypesForEntity,
  getDocumentTypeLabel,
  getDocumentTypeConfig,
  getDocumentTypeIcon,
  getAllDocumentTypeCodes,
  getComplianceDocumentTypes,
} from './document-types';
export type {
  DocumentTypeCode,
  DocumentTypeConfig,
  DocumentEntityType,
  EnforcementLevel,
  StopActionType,
} from './document-types';
