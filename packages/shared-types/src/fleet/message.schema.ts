import { z } from 'zod';

// ── Load / Driver Messages ──

export const LoadMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['driver', 'dispatcher', 'system']),
  content: z.string(),
  senderId: z.string().optional(),
  createdAt: z.string(),
  // Optional per-message load tag — the public load number this message is
  // about. Null for general (no-load) messages.
  loadNumber: z.string().nullable().optional(),
  // The tagged load's customer reference / PO number — pair with loadNumber
  // via `formatLoadLabel` when displaying the load.
  loadReference: z.string().nullable().optional(),
});
export type LoadMessage = z.infer<typeof LoadMessageSchema>;

export const UnreadCountResponseSchema = z.object({
  count: z.number(),
});
export type UnreadCountResponse = z.infer<typeof UnreadCountResponseSchema>;

// ── Driver conversation triage list ──

/** One row in the Tower Messages tab — a driver's conversation at a glance. */
export const DriverConversationSummarySchema = z.object({
  driverId: z.string(),
  driverName: z.string(),
  /** The driver's current active load number, or null when idle. */
  currentLoadNumber: z.string().nullable(),
  /** The current load's customer reference / PO number, or null. */
  currentLoadReference: z.string().nullable(),
  /** Last message preview text (already truncated server-side), or null. */
  lastMessage: z.string().nullable(),
  lastMessageAt: z.string().nullable(),
  unreadCount: z.number(),
  /** Who sent the last message — `driver` means the row needs a reply. */
  whoSpokeLast: z.enum(['driver', 'dispatcher', 'system']).nullable(),
  /** True when the current load has an active alert (drives the row accent). */
  hasActiveAlert: z.boolean(),
});
export type DriverConversationSummary = z.infer<typeof DriverConversationSummarySchema>;

/** Request body for sending a message into a driver thread. */
export const SendDriverMessageSchema = z.object({
  content: z.string().min(1).max(2000),
  /**
   * Load tag — the public load number this message is about. Omit → server
   * defaults to the driver's active load; explicit null → a general
   * (no-load) message.
   */
  loadNumber: z.string().nullable().optional(),
});
export type SendDriverMessageInput = z.infer<typeof SendDriverMessageSchema>;
