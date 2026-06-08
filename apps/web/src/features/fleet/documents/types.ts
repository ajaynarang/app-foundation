export type { DocumentTypeOption, PresignUploadRequest, PresignUploadResponse } from '@sally/shared-types';

export {
  getDocumentTypesForEntity,
  getDocumentTypeLabel,
  getDocumentTypeConfig,
  getDocumentTypeIcon,
} from '@sally/shared-types';

// Re-export pre-built arrays for backward compatibility with callers
// that import LOAD_DOCUMENT_TYPES etc. These now derive from the registry.
import { getDocumentTypesForEntity } from '@sally/shared-types';

export const LOAD_DOCUMENT_TYPES = getDocumentTypesForEntity('load');
export const DRIVER_DOCUMENT_TYPES = getDocumentTypesForEntity('driver');
export const VEHICLE_DOCUMENT_TYPES = getDocumentTypesForEntity('vehicle');

// Re-export Document but note: the shared-types Document schema has slightly
// different field shapes (string ids vs number ids). The frontend Document
// interface uses number-based ids matching the actual API response.
// Keep the local Document interface until the shared-types schema is aligned.
export interface Document {
  id: number;
  entityType: string;
  entityId: number;
  documentType: string;
  fileName: string;
  fileUrl: string;
  fileSize: number | null;
  mimeType: string | null;
  s3Key: string | null;
  status: string;
  description: string | null;
  relatedStopId: number | null;
  uploadedBy: number | null;
  tenantId: number;
  createdAt: string;
  updatedAt: string;
}
