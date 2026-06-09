import { apiClient } from '@/shared/lib/api';
import { useAuthStore } from '@/features/auth';
import { STORAGE_KEYS } from '@/shared/constants';
import type { UserMode } from './engine/types';

// ── Assistant capabilities (GET /assistant/capabilities) ──
// Shape of the capability catalog surfaced in the command palette / capability card.

/** A single thing the user can ask the assistant to do. */
export interface AssistantCapabilityItem {
  id: string;
  name: string;
  description: string;
  example: string;
}

/** Capability rows grouped under a category heading in the palette. */
export interface AssistantCapabilityCategory {
  title: string;
  items: AssistantCapabilityItem[];
}

/** A "Quick action" promoted to the top of the palette per role. */
export interface AssistantQuickAction {
  id: string;
  label: string;
  hint: string;
  prompt: string;
}

/** Full payload returned by GET /assistant/capabilities. */
export interface AssistantCapabilities {
  mode: UserMode;
  quickActions: AssistantQuickAction[];
  categories: AssistantCapabilityCategory[];
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

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

// ── Prospect (Public) API ──

export function getStoredSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEYS.APP_PROSPECT_TOKEN);
}

export function storeSessionToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.APP_PROSPECT_TOKEN, token);
}

export function clearSessionToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEYS.APP_PROSPECT_TOKEN);
}

export interface CreateProspectConversationResponse extends CreateConversationResponse {
  sessionToken: string;
}

export async function createProspectConversation(): Promise<CreateProspectConversationResponse> {
  const res = await fetch(`${API_BASE_URL}/prospect/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function getProspectStreamingUrl(conversationId: string): string {
  return `${API_BASE_URL}/prospect/conversations/${conversationId}/messages`;
}

export function getProspectHeaders(): Record<string, string> {
  const token = getStoredSessionToken();
  return token ? { 'X-Session-Token': token } : {};
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

// ── Capabilities ──

/**
 * Fetch the things Assistant can do for the current user. Mode is normally
 * derived from the JWT role on the backend; pass one to force a specific
 * set (e.g. a marketing surface that wants the prospect catalog while the
 * user happens to be authenticated).
 */
export async function getAssistantCapabilities(mode?: UserMode): Promise<AssistantCapabilities> {
  const query = mode ? `?mode=${encodeURIComponent(mode)}` : '';
  return apiClient<AssistantCapabilities>(`/assistant/capabilities${query}`);
}
