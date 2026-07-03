import { apiClient } from '@appshore/web-core/shared/lib/api';
import type { PreferencesResetResponse } from './types';

// Re-export domain types from @app/shared-types
export type { UserPreferences, EscalationPolicyConfig, GroupingConfig, ChannelConfig } from '@app/shared-types';

import type { UserPreferences } from '@app/shared-types';

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
// RESET TO DEFAULTS
// ============================================================================

export async function resetToDefaults(scope: 'user'): Promise<PreferencesResetResponse> {
  return apiClient<PreferencesResetResponse>('/settings/reset', {
    method: 'POST',
    body: JSON.stringify({ scope }),
  });
}
