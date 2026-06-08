import { apiClient } from '../../lib/api-client';

export type { IntegrationType, VendorMetadata, IntegrationConfig, UnifiedSyncLog } from '@app/shared-types';

// Re-export vendor as string alias for frontend flexibility
export type IntegrationVendor = string;

// Request types (kept local — only used in this file)
export interface CreateIntegrationRequest {
  integrationType: import('@app/shared-types').IntegrationType;
  vendor: IntegrationVendor;
  displayName: string;
  credentials?: Record<string, unknown>;
}

export interface UpdateIntegrationRequest {
  displayName?: string;
  credentials?: Record<string, unknown>;
  isEnabled?: boolean;
}

/**
 * List all integration configurations for the current tenant
 */
export async function listIntegrations(): Promise<import('@app/shared-types').IntegrationConfig[]> {
  return apiClient<import('@app/shared-types').IntegrationConfig[]>('/integrations', { method: 'GET' });
}

/**
 * Create a new integration configuration
 */
export async function createIntegration(
  data: CreateIntegrationRequest,
): Promise<import('@app/shared-types').IntegrationConfig> {
  return apiClient<import('@app/shared-types').IntegrationConfig>('/integrations', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Update an existing integration configuration
 */
export async function updateIntegration(
  integrationId: string,
  data: UpdateIntegrationRequest,
): Promise<import('@app/shared-types').IntegrationConfig> {
  return apiClient<import('@app/shared-types').IntegrationConfig>(`/integrations/${integrationId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

/**
 * Delete an integration configuration
 */
export async function deleteIntegration(integrationId: string): Promise<void> {
  return apiClient<void>(`/integrations/${integrationId}`, { method: 'DELETE' });
}

/**
 * Test connection to external system
 */
export async function testConnection(
  integrationId: string,
): Promise<import('@app/shared-types').TestConnectionResponse> {
  return apiClient<import('@app/shared-types').TestConnectionResponse>(`/integrations/${integrationId}/test`, {
    method: 'POST',
  });
}

/**
 * Trigger a manual sync for this integration
 */
export async function triggerSync(integrationId: string): Promise<import('@app/shared-types').SyncResponse> {
  return apiClient<import('@app/shared-types').SyncResponse>(`/integrations/${integrationId}/sync`, {
    method: 'POST',
  });
}

/**
 * Get sync history for an integration
 */
export async function getSyncHistory(
  integrationId: string,
  limit: number = 50,
  offset: number = 0,
): Promise<import('@app/shared-types').UnifiedSyncLog[]> {
  return apiClient<import('@app/shared-types').UnifiedSyncLog[]>(
    `/integrations/${integrationId}/sync-history?limit=${limit}&offset=${offset}`,
    {
      method: 'GET',
    },
  );
}

/**
 * Get vendor registry metadata
 */
export async function getVendorRegistry(): Promise<import('@app/shared-types').VendorMetadata[]> {
  return apiClient<import('@app/shared-types').VendorMetadata[]>('/integrations/vendors', { method: 'GET' });
}

/**
 * Get OAuth authorization URL for a vendor.
 * The user's browser will be redirected to this URL.
 */
export async function getOAuthConnectUrl(vendor: string): Promise<{ authUrl: string }> {
  return apiClient<{ authUrl: string }>(`/integrations/oauth/${vendor}/connect`, { method: 'GET' });
}

/**
 * Helper function to format relative time (e.g., "2 minutes ago")
 */
export function formatRelativeTime(dateString?: string): string {
  if (!dateString) return 'Never';

  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return date.toLocaleDateString();
}
