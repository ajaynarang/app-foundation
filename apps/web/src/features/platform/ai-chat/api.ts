import { apiClient } from '@/shared/lib/api';
import { useAuthStore } from '@/features/auth';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

// Re-export domain types from @app/shared-types
export type {
  ConversationGreeting,
  CreateConversationResponse,
  MessageResponse,
  ConversationSummary,
  ListConversationsResponse,
  GetMessagesResponse,
} from '@app/shared-types';

import type { CreateConversationResponse, ListConversationsResponse, GetMessagesResponse } from '@app/shared-types';

// ── API Functions ──

export async function createConversation(userMode: string): Promise<CreateConversationResponse> {
  return apiClient<CreateConversationResponse>('/conversations', {
    method: 'POST',
    body: JSON.stringify({ userMode }),
  });
}

export async function listConversations(limit: number = 10): Promise<ListConversationsResponse> {
  return apiClient<ListConversationsResponse>(`/conversations?limit=${limit}`);
}

export async function getConversationMessages(conversationId: string): Promise<GetMessagesResponse> {
  return apiClient<GetMessagesResponse>(`/conversations/${conversationId}/messages`);
}

// ── Streaming Helpers ──

/**
 * Returns the full URL for the streaming messages endpoint.
 * Used by the store to make a raw fetch (not through apiClient) for streaming.
 */
export function getStreamingUrl(conversationId: string): string {
  return `${API_BASE_URL}/conversations/${conversationId}/messages`;
}

/**
 * Returns the full URL for the HITL resume endpoint.
 */
export function getResumeUrl(conversationId: string): string {
  return `${API_BASE_URL}/conversations/${conversationId}/resume`;
}

/**
 * Returns auth headers for streaming fetch requests.
 */
export function getAuthHeaders(): Record<string, string> {
  const authState = useAuthStore.getState();
  const accessToken = authState.accessToken;
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

// ── Voice Mode ──

export async function getVoiceStatus(): Promise<{
  available: boolean;
  missing: string[];
}> {
  return apiClient<{ available: boolean; missing: string[] }>('/voice/status');
}

export async function getVoiceToken(conversationId: string): Promise<{ token: string; url: string }> {
  return apiClient<{ token: string; url: string }>('/voice/token', {
    method: 'POST',
    body: JSON.stringify({ conversationId }),
  });
}
