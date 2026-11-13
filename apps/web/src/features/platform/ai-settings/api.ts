import { apiClient } from '@appshore/web-core/shared/lib/api';
import type {
  AiCredentialConnectResult,
  AiSettings,
  BedrockBeginResponse,
  BedrockCompleteInput,
  ConnectKeyInput,
  UpdateAiPolicyInput,
} from '@app/shared-types';

/** The workspace's AI settings: its retention policy and its own AI keys. OWNER writes, ADMIN reads. */
export const aiSettingsApi = {
  get: () => apiClient<AiSettings>('/ai-settings'),

  updatePolicy: (data: UpdateAiPolicyInput) =>
    apiClient<AiSettings>('/ai-settings/policy', { method: 'PATCH', body: JSON.stringify(data) }),

  connectKey: (data: ConnectKeyInput) =>
    apiClient<AiCredentialConnectResult>('/ai-settings/credentials', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  beginBedrock: () => apiClient<BedrockBeginResponse>('/ai-settings/credentials/bedrock/begin', { method: 'POST' }),

  completeBedrock: (data: BedrockCompleteInput) =>
    apiClient<AiCredentialConnectResult>('/ai-settings/credentials/bedrock/complete', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  validate: (credentialId: string) =>
    apiClient<AiCredentialConnectResult>(`/ai-settings/credentials/${credentialId}/validate`, { method: 'POST' }),

  remove: (credentialId: string) => apiClient<void>(`/ai-settings/credentials/${credentialId}`, { method: 'DELETE' }),
};
