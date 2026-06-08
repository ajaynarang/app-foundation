/**
 * API contracts for Support domain endpoints (tenant + super-admin).
 *
 * `@sally/shared-types/operations/support.schema.ts` provides most of the
 * coverage. Two drifts observed during Phase 3 Group 3a (finding #28):
 *
 *   1. `TicketMessage` wire shape includes a `ticketId: string` key the
 *      shared-types schema omits. We extend the shared schema here.
 *   2. `SupportStats.avgResponseHours` arrives as a string (Prisma Decimal
 *      serialisation) but the shared-types schema declares `z.number()`.
 *      We override to accept the string form at the test layer until the
 *      backend is fixed to coerce to number.
 *
 * All other schemas re-export shared-types verbatim.
 */
import { z } from 'zod';
import {
  SupportTicketSchema as SharedSupportTicketSchema,
  SupportTicketDetailSchema as SharedSupportTicketDetailSchema,
  PaginatedTicketsSchema as SharedPaginatedTicketsSchema,
  TicketMessageSchema as SharedTicketMessageSchema,
} from '@sally/shared-types';

/** Single ticket (list + create response). */
export const SupportTicketSchema = SharedSupportTicketSchema;
export type SupportTicket = z.infer<typeof SupportTicketSchema>;

/** Ticket detail (GET /support/tickets/:id). */
export const SupportTicketDetailSchema = SharedSupportTicketDetailSchema;
export type SupportTicketDetail = z.infer<typeof SupportTicketDetailSchema>;

/** Super-admin stats (`GET /support/admin/stats`).
 *  Hand-written: `avgResponseHours` comes off the wire as string (Decimal) —
 *  shared-types says number. See finding #28. */
export const SupportStatsSchema = z.object({
  open: z.number(),
  inProgress: z.number(),
  waiting: z.number(),
  resolvedLast30d: z.number(),
  avgResponseHours: z.union([z.number(), z.string()]),
});
export type SupportStats = z.infer<typeof SupportStatsSchema>;

/** Super-admin paginated tickets envelope (`GET /support/admin/tickets`). */
export const SupportTicketListItemSchema = SharedPaginatedTicketsSchema;
export type SupportTicketList = z.infer<typeof SupportTicketListItemSchema>;

/** Single ticket message (POST /support/tickets/:id/messages).
 *  Hand-extended: wire shape includes numeric `ticketId` that shared-types
 *  omits (the numeric DB FK, not the string `TKT-xxx` number). See finding #28. */
export const SupportMessageSchema = SharedTicketMessageSchema.extend({
  ticketId: z.number().int(),
});
export type SupportMessage = z.infer<typeof SupportMessageSchema>;
