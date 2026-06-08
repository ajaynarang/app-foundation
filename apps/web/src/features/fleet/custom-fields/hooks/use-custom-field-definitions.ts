import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { showSuccess, showError } from '@sally/ui';
import { queryKeys } from '@/shared/constants/query-keys';
import { extractErrorMessage } from '@/shared/lib/error-utils';
import { customFieldsApi } from '../api';
import type {
  CustomFieldEntityType,
  CreateCustomFieldDefinitionInput,
  UpdateCustomFieldDefinitionInput,
} from '../types';

// ─── Queries ─────────────────────────────────────────────────────────────────

export function useCustomFieldDefinitions(entityType: CustomFieldEntityType) {
  return useQuery({
    queryKey: queryKeys.customFields.definitions(entityType),
    queryFn: () => customFieldsApi.listDefinitions(entityType),
    enabled: !!entityType,
    staleTime: 5 * 60 * 1000, // 5 min — matches backend cache TTL
  });
}

export function useCustomFieldUsageCount(id: number | null) {
  return useQuery({
    queryKey: queryKeys.customFields.usage(id ?? 0),
    queryFn: () => customFieldsApi.getUsageCount(id!),
    enabled: id != null,
  });
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export function useCreateCustomFieldDefinition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateCustomFieldDefinitionInput) => customFieldsApi.createDefinition(data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.customFields.root,
      });
      showSuccess('Custom field created');
    },
    onError: (error: Error) => {
      showError('Failed to create custom field', extractErrorMessage(error));
    },
  });
}

export function useUpdateCustomFieldDefinition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateCustomFieldDefinitionInput }) =>
      customFieldsApi.updateDefinition(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.customFields.root,
      });
      showSuccess('Custom field updated');
    },
    onError: (error: Error) => {
      showError('Failed to update custom field', extractErrorMessage(error));
    },
  });
}

export function useDeactivateCustomFieldDefinition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => customFieldsApi.deactivateDefinition(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.customFields.root,
      });
      showSuccess('Custom field deactivated');
    },
    onError: (error: Error) => {
      showError('Failed to deactivate custom field', extractErrorMessage(error));
    },
  });
}

export function useReorderCustomFieldDefinitions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orderedIds: number[]) => customFieldsApi.reorderDefinitions(orderedIds),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.customFields.root,
      });
    },
    onError: (error: Error) => {
      showError('Failed to reorder custom fields', extractErrorMessage(error));
    },
  });
}
