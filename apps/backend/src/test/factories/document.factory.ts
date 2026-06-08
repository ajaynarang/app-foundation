import { recent } from '../helpers/time.helpers';

export function makeDocument(overrides?: Record<string, any>) {
  return {
    id: 1,
    entityType: 'load',
    entityId: 1,
    documentType: 'BOL',
    fileName: 'bol-LD-1001.pdf',
    fileUrl: 'https://s3.amazonaws.com/test-bucket/bol-LD-1001.pdf',
    fileSize: 204800,
    mimeType: 'application/pdf',
    uploadedBy: 1,
    tenantId: 1,
    status: 'CONFIRMED',
    s3Key: 'documents/bol-LD-1001.pdf',
    createdAt: recent(),
    updatedAt: recent(),
    ...overrides,
  };
}
