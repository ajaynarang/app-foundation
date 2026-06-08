import { z } from 'zod';
import {
  SupportCategory,
  SupportCategorySchema,
  SupportPriority,
  SupportPrioritySchema,
  SupportStatus,
  SupportStatusSchema,
} from '../generated/prisma-enums';

// ─── Enums ───

// Support enums re-exported from the codegen mirror — Prisma enums are the
// single source of truth.
export {
  SupportCategory,
  SupportCategorySchema,
  SupportPriority,
  SupportPrioritySchema,
  SupportStatus,
  SupportStatusSchema,
};

// ─── Shared sub-types ───

export const TicketUserSchema = z.object({
  userId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  role: z.string(),
});
export type TicketUser = z.infer<typeof TicketUserSchema>;

export const TicketTenantSchema = z.object({
  tenantId: z.string(),
  companyName: z.string(),
  plan: z.string(),
});
export type TicketTenant = z.infer<typeof TicketTenantSchema>;

export const RelatedEntitySchema = z.object({
  type: z.string(),
  id: z.string(),
  label: z.string().optional(),
});
export type RelatedEntity = z.infer<typeof RelatedEntitySchema>;

// ─── Ticket message ───

export const TicketMessageSchema = z.object({
  messageId: z.string(),
  authorRole: z.enum(['user', 'admin', 'system']),
  content: z.string(),
  isInternal: z.boolean(),
  author: TicketUserSchema,
  createdAt: z.string(),
});
export type TicketMessage = z.infer<typeof TicketMessageSchema>;

// ─── Conversation snapshot (for linked Sally AI conversations) ───

export const ConversationSnapshotSchema = z.object({
  conversationId: z.string(),
  messages: z.array(
    z.object({
      role: z.string(),
      content: z.string(),
      createdAt: z.string(),
    }),
  ),
});
export type ConversationSnapshot = z.infer<typeof ConversationSnapshotSchema>;

// ─── Support ticket ───

export const SupportTicketSchema = z.object({
  id: z.number(),
  ticketNumber: z.string(),
  subject: z.string(),
  description: z.string(),
  category: SupportCategorySchema,
  priority: SupportPrioritySchema,
  status: SupportStatusSchema,
  aiResolved: z.boolean(),
  relatedEntities: z.array(RelatedEntitySchema).nullable(),
  createdBy: TicketUserSchema,
  tenant: TicketTenantSchema.optional(),
  messageCount: z.number(),
  firstResponseAt: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  closedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SupportTicket = z.infer<typeof SupportTicketSchema>;

export const SupportTicketDetailSchema = SupportTicketSchema.extend({
  messages: z.array(TicketMessageSchema),
  conversation: ConversationSnapshotSchema.nullable(),
});
export type SupportTicketDetail = z.infer<typeof SupportTicketDetailSchema>;

// ─── Stats ───

export const SupportStatsSchema = z.object({
  open: z.number(),
  inProgress: z.number(),
  waiting: z.number(),
  resolvedLast30d: z.number(),
  avgResponseHours: z.number(),
});
export type SupportStats = z.infer<typeof SupportStatsSchema>;

// ─── Paginated response ───

export const PaginatedTicketsSchema = z.object({
  tickets: z.array(SupportTicketSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});
export type PaginatedTickets = z.infer<typeof PaginatedTicketsSchema>;
