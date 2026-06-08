import { apiClient } from '@/shared/lib/api';
import type { Document, PresignUploadRequest, PresignUploadResponse } from './types';

export const documentsApi = {
  presignUpload: async (data: PresignUploadRequest): Promise<PresignUploadResponse> => {
    return apiClient<PresignUploadResponse>('/documents/presign-upload', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  confirmUpload: async (documentId: number): Promise<Document> => {
    return apiClient<Document>(`/documents/${documentId}/confirm`, {
      method: 'POST',
    });
  },

  listDocuments: async (entityType: string, entityId: number): Promise<Document[]> => {
    const params = new URLSearchParams({
      entityType: entityType,
      entityId: String(entityId),
    });
    return apiClient<Document[]>(`/documents?${params.toString()}`);
  },

  getDocument: async (documentId: number): Promise<Document> => {
    return apiClient<Document>(`/documents/${documentId}`);
  },

  getDownloadUrl: async (documentId: number): Promise<{ downloadUrl: string }> => {
    return apiClient<{ downloadUrl: string }>(`/documents/${documentId}/download`);
  },

  deleteDocument: async (documentId: number): Promise<{ deleted: boolean }> => {
    return apiClient<{ deleted: boolean }>(`/documents/${documentId}`, {
      method: 'DELETE',
    });
  },
};
