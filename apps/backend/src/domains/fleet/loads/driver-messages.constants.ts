/**
 * Driver-conversation constants — single source of truth for the persistent
 * driver↔dispatcher thread. One conversation per driver; each message carries
 * an optional per-message load tag (`ConversationMessage.loadId`).
 *
 * Anything reading the conversation table for *operational* messages (the
 * Tower wire, the Messages inbox, the load-scoped message view) must filter on
 * `DRIVER_CONVERSATION_USER_MODE` so Sally AI chat never leaks into
 * operational surfaces.
 */

/** `Conversation.userMode` value for a driver↔dispatcher thread. */
export const DRIVER_CONVERSATION_USER_MODE = 'driver_dispatch';

/** Deterministic `Conversation.conversationId` for a driver thread. */
export function driverConversationId(tenantId: number, driverId: string): string {
  return `driver-dispatch-${tenantId}-${driverId}`;
}
