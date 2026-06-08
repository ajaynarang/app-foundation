import { apiClient } from '@/shared/lib/api';

export type {
  IntegrationType,
  IntegrationStatus,
  CredentialField,
  ConnectionMethod,
  VendorMetadata,
  IntegrationConfig,
  SyncResponse,
  SyncStats,
  IntegrationHealthItem,
  IntegrationHealthSummary,
  UnifiedSyncLog,
  UnifiedSyncHistoryResponse,
  TestConnectionResponse,
} from '@sally/shared-types';

// Re-export vendor as string alias for frontend flexibility
export type IntegrationVendor = string;

// Request types (kept local — only used in this file)
export interface CreateIntegrationRequest {
  integrationType: import('@sally/shared-types').IntegrationType;
  vendor: IntegrationVendor;
  displayName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  credentials?: Record<string, any>;
}

export interface UpdateIntegrationRequest {
  displayName?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  credentials?: Record<string, any>;
  isEnabled?: boolean;
}

// Sync type / trigger source enums (kept local — UI-only)
export type SyncType = 'FLEET' | 'LOADS' | 'DRIVERS' | 'VEHICLES' | 'ELD' | 'HOS' | 'TELEMATICS';
export type TriggerSource = 'manual' | 'scheduled';

/**
 * List all integration configurations for the current tenant
 */
export async function listIntegrations(): Promise<import('@sally/shared-types').IntegrationConfig[]> {
  return apiClient<import('@sally/shared-types').IntegrationConfig[]>('/integrations', { method: 'GET' });
}

/**
 * Get a specific integration configuration by ID
 */
export async function getIntegration(integrationId: string): Promise<import('@sally/shared-types').IntegrationConfig> {
  return apiClient<import('@sally/shared-types').IntegrationConfig>(`/integrations/${integrationId}`, {
    method: 'GET',
  });
}

/**
 * Create a new integration configuration
 */
export async function createIntegration(
  data: CreateIntegrationRequest,
): Promise<import('@sally/shared-types').IntegrationConfig> {
  return apiClient<import('@sally/shared-types').IntegrationConfig>('/integrations', {
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
): Promise<import('@sally/shared-types').IntegrationConfig> {
  return apiClient<import('@sally/shared-types').IntegrationConfig>(`/integrations/${integrationId}`, {
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
): Promise<import('@sally/shared-types').TestConnectionResponse> {
  return apiClient<import('@sally/shared-types').TestConnectionResponse>(`/integrations/${integrationId}/test`, {
    method: 'POST',
  });
}

/**
 * Trigger a manual sync for this integration
 */
export async function triggerSync(integrationId: string): Promise<import('@sally/shared-types').SyncResponse> {
  return apiClient<import('@sally/shared-types').SyncResponse>(`/integrations/${integrationId}/sync`, {
    method: 'POST',
  });
}

/**
 * Trigger fleet-wide sync (all enabled integrations for tenant)
 */
export async function syncFleet(): Promise<import('@sally/shared-types').SyncResponse> {
  return apiClient<import('@sally/shared-types').SyncResponse>('/integrations/fleet/sync', {
    method: 'POST',
  });
}

/**
 * Sync HOS clocks from ELD provider
 */
export async function syncHOS(): Promise<import('@sally/shared-types').SyncResponse> {
  return apiClient<import('@sally/shared-types').SyncResponse>('/integrations/eld/sync-hos', {
    method: 'POST',
  });
}

/**
 * Sync telematics (GPS locations) from ELD provider
 */
export async function syncTelematics(): Promise<import('@sally/shared-types').SyncResponse> {
  return apiClient<import('@sally/shared-types').SyncResponse>('/integrations/eld/sync-telematics', {
    method: 'POST',
  });
}

/**
 * Sync both HOS and telematics from ELD provider
 */
export async function syncELD(): Promise<import('@sally/shared-types').SyncResponse> {
  return apiClient<import('@sally/shared-types').SyncResponse>('/integrations/eld/sync', {
    method: 'POST',
  });
}

/**
 * Sync loads from TMS
 */
export async function syncLoads(): Promise<import('@sally/shared-types').SyncResponse> {
  return apiClient<import('@sally/shared-types').SyncResponse>('/integrations/fleet/sync-loads', {
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
): Promise<import('@sally/shared-types').UnifiedSyncLog[]> {
  return apiClient<import('@sally/shared-types').UnifiedSyncLog[]>(
    `/integrations/${integrationId}/sync-history?limit=${limit}&offset=${offset}`,
    {
      method: 'GET',
    },
  );
}

/**
 * Get sync statistics for an integration
 */
export async function getSyncStats(integrationId: string): Promise<import('@sally/shared-types').SyncStats> {
  return apiClient<import('@sally/shared-types').SyncStats>(`/integrations/${integrationId}/sync-history/stats`, {
    method: 'GET',
  });
}

/**
 * Get unified sync history across all integrations
 */
export async function getUnifiedSyncHistory(
  limit: number = 20,
  offset: number = 0,
  syncType?: string,
  status?: string,
): Promise<import('@sally/shared-types').UnifiedSyncHistoryResponse> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (syncType) params.set('syncType', syncType);
  if (status) params.set('status', status);

  return apiClient<import('@sally/shared-types').UnifiedSyncHistoryResponse>(`/integrations/sync-history?${params}`, {
    method: 'GET',
  });
}

/**
 * Get vendor registry metadata
 */
export async function getVendorRegistry(): Promise<import('@sally/shared-types').VendorMetadata[]> {
  return apiClient<import('@sally/shared-types').VendorMetadata[]>('/integrations/vendors', { method: 'GET' });
}

export async function getIntegrationHealth(): Promise<import('@sally/shared-types').IntegrationHealthSummary> {
  return apiClient<import('@sally/shared-types').IntegrationHealthSummary>('/integrations/health');
}

/**
 * Get OAuth authorization URL for a vendor.
 * The user's browser will be redirected to this URL.
 */
export async function getOAuthConnectUrl(vendor: string): Promise<{ authUrl: string }> {
  return apiClient<{ authUrl: string }>(`/integrations/oauth/${vendor}/connect`, { method: 'GET' });
}

/**
 * Disconnect an OAuth integration for a vendor.
 */
export async function disconnectOAuth(vendor: string): Promise<{ success: boolean; message: string }> {
  return apiClient<{ success: boolean; message: string }>(`/integrations/oauth/${vendor}/disconnect`, {
    method: 'POST',
  });
}

/**
 * Helper function to get human-readable integration type labels
 */
export function getIntegrationTypeLabel(type: import('@sally/shared-types').IntegrationType): string {
  const labels: Record<string, string> = {
    TMS: 'Transportation Management System',
    ELD: 'ELD (HOS & Telematics)',
    ACCOUNTING: 'Accounting',
  };
  return labels[type];
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
