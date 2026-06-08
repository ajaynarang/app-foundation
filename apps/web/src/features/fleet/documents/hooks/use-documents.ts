import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { documentsApi } from '../api';
import { showSuccess, showError } from '@sally/ui';
import type { PresignUploadRequest } from '../types';
import { extractErrorMessage } from '@/shared/lib/error-utils';
import { queryKeys } from '@/shared/constants/query-keys';
import { QUERY_TIERS } from '@/shared/config/query-tiers';

export function useDocuments(entityType: string, entityId: number | null) {
  return useQuery({
    queryKey: queryKeys.documents.list(entityType, entityId!),
    queryFn: () => documentsApi.listDocuments(entityType, entityId!),
    enabled: entityId !== null,
  });
}

export function useDocumentDownloadUrl(documentId: number | null) {
  return useQuery({
    queryKey: queryKeys.documents.downloadUrl(documentId!),
    queryFn: () => documentsApi.getDownloadUrl(documentId!),
    enabled: documentId !== null,
    ...QUERY_TIERS.STATIC,
  });
}

export function usePresignUpload() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: PresignUploadRequest) => documentsApi.presignUpload(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documents.root });
    },
    onError: (error: Error) => {
      showError('Failed to upload document', extractErrorMessage(error));
    },
  });
}

export function useConfirmUpload() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (documentId: number) => documentsApi.confirmUpload(documentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documents.root });
      // Document completion can change billing_status (e.g. NEEDS_DOCS → READY_FOR_REVIEW)
      queryClient.invalidateQueries({ queryKey: queryKeys.closeOut.root });
      showSuccess('Document uploaded');
    },
    onError: (error: Error) => {
      showError('Failed to confirm upload', extractErrorMessage(error));
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (documentId: number) => documentsApi.deleteDocument(documentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documents.root });
      // Deleting a required doc can revert billing_status (e.g. READY_FOR_REVIEW → NEEDS_DOCS)
      queryClient.invalidateQueries({ queryKey: queryKeys.closeOut.root });
      showSuccess('Document deleted');
    },
    onError: (error: Error) => {
      showError('Failed to delete document', extractErrorMessage(error));
    },
  });
}
