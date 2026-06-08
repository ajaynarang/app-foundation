import { apiClient } from '@/shared/lib/api';
import type {
  CustomFieldDefinition,
  CustomFieldEntityType,
  CreateCustomFieldDefinitionInput,
  UpdateCustomFieldDefinitionInput,
} from './types';

export interface CustomFieldUsageCount {
  count: number;
}

export const customFieldsApi = {
  /**
   * List all active definitions for a given entity type.
   */
  listDefinitions: async (entityType: CustomFieldEntityType): Promise<CustomFieldDefinition[]> => {
    return apiClient<CustomFieldDefinition[]>(`/custom-fields/definitions?entityType=${entityType}`);
  },

  /**
   * Create a new custom field definition.
   */
  createDefinition: async (data: CreateCustomFieldDefinitionInput): Promise<CustomFieldDefinition> => {
    return apiClient<CustomFieldDefinition>('/custom-fields/definitions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Update an existing custom field definition.
   */
  updateDefinition: async (id: number, data: UpdateCustomFieldDefinitionInput): Promise<CustomFieldDefinition> => {
    return apiClient<CustomFieldDefinition>(`/custom-fields/definitions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  /**
   * Deactivate (soft-delete) a custom field definition.
   */
  deactivateDefinition: async (id: number): Promise<void> => {
    return apiClient<void>(`/custom-fields/definitions/${id}`, {
      method: 'DELETE',
    });
  },

  /**
   * Reorder definitions by providing an ordered array of IDs.
   */
  reorderDefinitions: async (orderedIds: number[]): Promise<CustomFieldDefinition[]> => {
    return apiClient<CustomFieldDefinition[]>('/custom-fields/definitions/reorder', {
      method: 'PATCH',
      body: JSON.stringify({ orderedIds }),
    });
  },

  /**
   * Get the number of entities that have a value set for a given definition.
   */
  getUsageCount: async (id: number): Promise<CustomFieldUsageCount> => {
    return apiClient<CustomFieldUsageCount>(`/custom-fields/definitions/${id}/usage`);
  },
};
