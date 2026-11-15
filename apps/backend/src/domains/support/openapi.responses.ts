import { z } from 'zod';
import {
  SupportCategorySchema,
  SupportPrioritySchema,
  SupportStatusSchema,
  TenantPlanSchema,
  UserRoleSchema,
} from '@app/shared-types';
import { defineResponseSchema } from '@appshore/platform/shared/openapi/api-result';
import { defineCursorListSchema } from '@appshore/platform/shared/openapi/common-responses';

/** The support desk's response bodies: the wire form of `SupportService`'s mappers, named once. */

/** A person on a ticket, by public user id. */
const SupportPersonSchema = z.object({
  userId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().nullable(),
  role: UserRoleSchema,
});

/**
 * A ticket. Its routes still address it by the numeric `id` (listed in `id-boundary.allowlist.json`); `ticketNumber`
 * (ST-n) is what a person reads. `tenant` comes with the super-admin reads and the update only.
 */
const SupportTicketSchema = z.object({
  id: z.number().int(),
  ticketNumber: z.string(),
  subject: z.string(),
  description: z.string(),
  category: SupportCategorySchema,
  priority: SupportPrioritySchema,
  status: SupportStatusSchema,
  aiResolved: z.boolean(),
  relatedEntities: z.unknown().nullable(),
  createdBy: SupportPersonSchema,
  tenant: z.object({ tenantId: z.string(), companyName: z.string(), plan: TenantPlanSchema }).optional(),
  messageCount: z.number().int().describe('Counted on list reads; 0 elsewhere'),
  firstResponseAt: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  closedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const SupportTicketMessageSchema = z.object({
  messageId: z.string(),
  authorRole: z.string().describe('user | admin | system'),
  content: z.string(),
  isInternal: z.boolean(),
  author: SupportPersonSchema,
  createdAt: z.string(),
});

export const SupportTicketResponse = defineResponseSchema('SupportTicket', SupportTicketSchema);
export const SupportTicketListResponse = defineCursorListSchema('SupportTicketList', SupportTicketSchema);

/** A ticket with its thread (internal notes only for the super admin) and the AI conversation that spawned it. */
export const SupportTicketDetailResponse = defineResponseSchema(
  'SupportTicketDetail',
  SupportTicketSchema.extend({
    messages: z.array(SupportTicketMessageSchema),
    conversation: z
      .object({
        conversationId: z.string(),
        messages: z
          .array(z.object({ role: z.string(), content: z.string(), createdAt: z.string() }))
          .describe('The first 50 messages, oldest first'),
      })
      .nullable(),
  }),
);

export const SupportTicketMessageResponse = defineResponseSchema(
  'SupportTicketMessage',
  SupportTicketMessageSchema.extend({ ticketId: z.number().int().describe('The ticket numeric id') }),
);

export const SupportStatsResponse = defineResponseSchema(
  'SupportStats',
  z.object({
    open: z.number().int(),
    inProgress: z.number().int(),
    waiting: z.number().int(),
    resolvedLast30d: z.number().int(),
    avgResponseHours: z
      .union([z.number(), z.string()])
      .describe('Average hours to first response over 30 days, one decimal (a numeric string from SQL; 0 when none)'),
  }),
);

/** The tenants that have opened a ticket, by company name (the admin tenant picker). */
export const SupportTenantListResponse = defineCursorListSchema(
  'SupportTenantList',
  z.object({
    id: z.number().int().describe('Tenant numeric id (listed in id-boundary.allowlist.json)'),
    tenantId: z.string(),
    companyName: z.string(),
  }),
);
