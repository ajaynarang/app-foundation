import type { QueryKey } from '@tanstack/react-query';
import { SSE_EVENTS, type SseEventType } from '@app/shared-types';
import { queryKeys } from '@/shared/constants/query-keys';

/**
 * Map SSE event types to TanStack Query keys to invalidate.
 *
 * Single source of truth — every cache-busting effect for an event lives
 * here, not in feature components.
 *
 * Values reference `queryKeys` so a rename in query-keys.ts propagates
 * automatically. Each generic platform event maps to the query keys that
 * become stale when it fires.
 *
 * Events not listed here are still delivered to bus subscribers
 * (`useSseEvent`); they simply trigger no automatic cache invalidation.
 */
export const SSE_INVALIDATION_MAP: Partial<Record<SseEventType, readonly QueryKey[]>> = {
  // A new notification — refresh the inbox / unread count.
  [SSE_EVENTS.NOTIFICATION_NEW]: [queryKeys.notifications.root],

  // A teammate was invited — refresh the org/members view.
  [SSE_EVENTS.USER_INVITED]: [queryKeys.organization.root],

  // Tenant profile/settings changed — refresh org profile + settings.
  [SSE_EVENTS.TENANT_UPDATED]: [queryKeys.organization.root, queryKeys.tenantSettings.root],

  // An integration finished syncing — refresh integration health/list.
  [SSE_EVENTS.INTEGRATION_SYNCED]: [queryKeys.integrations.root, queryKeys.integrationHealth.root],

  // A new AI message landed — refresh the conversation thread.
  [SSE_EVENTS.AI_MESSAGE]: [queryKeys.conversations.root],

  // Agent management surfaces.
  [SSE_EVENTS.API_KEY_UPDATED]: [queryKeys.apiKeys.list()],
  [SSE_EVENTS.OAUTH_CLIENT_UPDATED]: [queryKeys.oauthClients.list()],
  [SSE_EVENTS.AGENT_INVOCATION_COMPLETED]: [queryKeys.agentActivity.root],

  // HEARTBEAT — connection keep-alive only; no cache effect.
};
