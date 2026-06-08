import { apiClient } from '@/shared/lib/api';
import type { PreferencesResetResponse } from './types';

// Re-export domain types from @sally/shared-types
export type {
  UserPreferences,
  OperationsSettings,
  DriverPreferences,
  AlertTypeConfig,
  EscalationPolicyConfig,
  GroupingConfig,
  ChannelConfig,
  AlertConfiguration,
} from '@sally/shared-types';

import type { UserPreferences, OperationsSettings, DriverPreferences, AlertConfiguration } from '@sally/shared-types';

// ============================================================================
// USER PREFERENCES
// ============================================================================

export async function getUserPreferences(): Promise<UserPreferences> {
  return apiClient<UserPreferences>('/settings/general');
}

export async function updateUserPreferences(updates: Partial<UserPreferences>): Promise<UserPreferences> {
  // Strip read-only fields the backend DTO rejects
  const {
    id: _id,
    userId: _userId,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...payload
  } = updates as Partial<UserPreferences> & Record<string, unknown>;
  return apiClient<UserPreferences>('/settings/general', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

// ============================================================================
// OPERATIONS SETTINGS
// ============================================================================

export async function getOperationsSettings(): Promise<OperationsSettings> {
  return apiClient<OperationsSettings>('/settings/operations');
}

export async function updateOperationsSettings(updates: Partial<OperationsSettings>): Promise<OperationsSettings> {
  // Strip read-only fields the backend DTO rejects
  const {
    id: _id,
    tenantId: _tenantId,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...payload
  } = updates as Partial<OperationsSettings> & Record<string, unknown>;
  return apiClient<OperationsSettings>('/settings/operations', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

// ============================================================================
// DRIVER PREFERENCES
// ============================================================================

export async function getDriverPreferences(): Promise<DriverPreferences> {
  return apiClient<DriverPreferences>('/settings/driver');
}

export async function updateDriverPreferences(updates: Partial<DriverPreferences>): Promise<DriverPreferences> {
  // Strip read-only fields the backend DTO rejects
  const {
    id: _id,
    userId: _userId,
    driverId: _driverId,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...payload
  } = updates as Partial<DriverPreferences> & Record<string, unknown>;
  return apiClient<DriverPreferences>('/settings/driver', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

// ============================================================================
// ALERT CONFIGURATION
// ============================================================================

export async function getAlertConfig(): Promise<AlertConfiguration> {
  return apiClient<AlertConfiguration>('/settings/alerts');
}

export async function updateAlertConfig(config: AlertConfiguration): Promise<AlertConfiguration> {
  return apiClient<AlertConfiguration>('/settings/alerts', {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}

// ============================================================================
// RESET TO DEFAULTS
// ============================================================================

export async function resetToDefaults(scope: 'user' | 'operations' | 'driver'): Promise<PreferencesResetResponse> {
  if (scope === 'operations') {
    return apiClient<PreferencesResetResponse>('/settings/operations/reset', {
      method: 'POST',
    });
  }
  return apiClient<PreferencesResetResponse>('/settings/reset', {
    method: 'POST',
    body: JSON.stringify({ scope }),
  });
}
