/**
 * API contracts for Support domain endpoints (tenant + super-admin).
 *
 * Hand-written against the backend `support` domain (SupportTicket /
 * SupportTicketMessage Prisma models + SupportController routes):
 *   POST /support/tickets, GET /support/tickets, GET /support/tickets/:id,
 *   POST /support/tickets/:id/messages, GET /support/admin/tickets,
 *   GET /support/admin/tickets/:id, POST /support/admin/tickets/:id/messages,
 *   GET /support/admin/stats, GET /support/admin/tenants.
 */
import { z } from 'zod';
import { dbId, isoDateString } from './helpers.js';

const SupportCategoryEnum = z.enum(['BILLING', 'TECHNICAL', 'FEATURE_REQUEST', 'ACCOUNT', 'INTEGRATION', 'GENERAL']);
const SupportPriorityEnum = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);
const SupportStatusEnum = z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'RESOLVED', 'CLOSED']);

/** Single ticket (list + create response). */
export const SupportTicketSchema = z.object({
  id: dbId,
  ticketNumber: z.string(),
  subject: z.string(),
  description: z.string(),
  category: SupportCategoryEnum,
  priority: SupportPriorityEnum,
  status: SupportStatusEnum,
  aiResolved: z.boolean().optional(),
  firstResponseAt: isoDateString.nullable().optional(),
  resolvedAt: isoDateString.nullable().optional(),
  closedAt: isoDateString.nullable().optional(),
  createdAt: isoDateString,
  updatedAt: isoDateString.optional(),
});
export type SupportTicket = z.infer<typeof SupportTicketSchema>;

/** Single ticket message (POST /support/tickets/:id/messages). */
export const SupportMessageSchema = z.object({
  id: dbId,
  messageId: z.string(),
  ticketId: z.number().int(),
  authorRole: z.string(),
  content: z.string(),
  isInternal: z.boolean(),
  createdAt: isoDateString,
});
export type SupportMessage = z.infer<typeof SupportMessageSchema>;

/** Ticket detail (GET /support/tickets/:id) — ticket + message thread. */
export const SupportTicketDetailSchema = SupportTicketSchema.extend({
  messages: z.array(SupportMessageSchema.passthrough()).optional(),
}).passthrough();
export type SupportTicketDetail = z.infer<typeof SupportTicketDetailSchema>;

/** Super-admin stats (`GET /support/admin/stats`).
 *  `avgResponseHours` can come off the wire as string (Prisma Decimal serialisation). */
export const SupportStatsSchema = z.object({
  open: z.number(),
  inProgress: z.number(),
  waiting: z.number(),
  resolvedLast30d: z.number(),
  avgResponseHours: z.union([z.number(), z.string()]),
});
export type SupportStats = z.infer<typeof SupportStatsSchema>;

/** Super-admin paginated tickets envelope (`GET /support/admin/tickets`). */
export const SupportTicketListItemSchema = z.object({
  data: z.array(SupportTicketSchema.passthrough()),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
});
export type SupportTicketList = z.infer<typeof SupportTicketListItemSchema>;
