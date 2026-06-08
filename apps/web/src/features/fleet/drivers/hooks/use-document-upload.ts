'use client';

import { useState } from 'react';
import { documentsApi } from '@/features/fleet/documents/api';
import { showSuccess, showError } from '@sally/ui';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB — matches backend limit
const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/tiff', 'image/heic']);

interface UploadParams {
  file: File;
  entityType: 'load' | 'load_stop';
  entityId: number;
  documentType: string;
  relatedStopId?: number;
}

export function useDocumentUpload() {
  const [isUploading, setIsUploading] = useState(false);

  const upload = async (params: UploadParams) => {
    // Client-side validation — fail fast before network calls
    if (params.file.size > MAX_FILE_SIZE) {
      showError('File too large', 'Maximum file size is 10 MB');
      return;
    }
    if (params.file.type && !ALLOWED_MIME_TYPES.has(params.file.type)) {
      showError('Unsupported file type', 'Allowed: PDF, JPEG, PNG, TIFF, HEIC');
      return;
    }

    setIsUploading(true);
    try {
      // 1. Get presigned URL
      const presign = await documentsApi.presignUpload({
        fileName: params.file.name,
        mimeType: params.file.type,
        fileSize: params.file.size,
        entityType: params.entityType,
        entityId: String(params.entityId),
        documentType: params.documentType,
        ...(params.relatedStopId !== undefined ? { relatedStopId: String(params.relatedStopId) } : {}),
      });

      // 2. Upload file to S3
      const uploadResponse = await fetch(presign.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': params.file.type },
        body: params.file,
      });

      if (!uploadResponse.ok) {
        throw new Error(`S3 upload failed: ${uploadResponse.status}`);
      }

      // 3. Confirm upload
      await documentsApi.confirmUpload(presign.documentId);

      showSuccess('Document uploaded');
      return presign.documentId;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      showError('Failed to upload document', message);
      throw error;
    } finally {
      setIsUploading(false);
    }
  };

  return { upload, isUploading };
}
