import { apiClient } from '../../lib/api-client';

export type { OperationsSettings, AlertConfiguration } from '@app/shared-types';

import type { OperationsSettings, AlertConfiguration } from '@app/shared-types';

export async function getOperationsSettings(): Promise<OperationsSettings> {
  return apiClient<OperationsSettings>('/settings/operations');
}

type ServerManagedKeys = 'id' | 'tenantId' | 'createdAt' | 'updatedAt';

export async function updateOperationsSettings(updates: Partial<OperationsSettings>): Promise<OperationsSettings> {
  const {
    id: _id,
    tenantId: _tenantId,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...payload
  } = updates as Partial<OperationsSettings> & Partial<Record<ServerManagedKeys, unknown>>;
  return apiClient<OperationsSettings>('/settings/operations', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function getAlertConfig(): Promise<AlertConfiguration> {
  return apiClient<AlertConfiguration>('/settings/alerts');
}

export async function updateAlertConfig(updates: Partial<AlertConfiguration>): Promise<AlertConfiguration> {
  const {
    id: _id,
    tenantId: _tenantId,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...payload
  } = updates as Partial<AlertConfiguration> & Partial<Record<ServerManagedKeys, unknown>>;
  return apiClient<AlertConfiguration>('/settings/alerts', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function resetToDefaults(scope: 'user' | 'operations' | 'driver'): Promise<unknown> {
  if (scope === 'operations') {
    return apiClient<unknown>('/settings/operations/reset', {
      method: 'POST',
    });
  }
  return apiClient<unknown>('/settings/reset', {
    method: 'POST',
    body: JSON.stringify({ scope }),
  });
}
