import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { UserRole } from '@appshore/db';
import { SupportCategorySchema, SupportPrioritySchema, SupportStatusSchema } from '@app/shared-types';
import { SupportService } from '../../../support/support.service';
import { RequiresScope } from '../../agent-contract/requires-scope.decorator';
import { RestrictToRoles } from '../../agent-contract/tool-policy.decorator';
import { ToolNames } from '../../agent-contract/tool-names.constants';

/**
 * Example tool pair: a read and a write over the existing support desk, showing every rule a product's own tools
 * follow. Both call `SupportService`; neither adds a model.
 *
 * - Each method declares `@RequiresScope`; the write's scope (`platform:write`) makes it a write everywhere: chat
 *   offers `confirm-action`, an external agent is challenged, MCP clients see it as not read-only.
 * - The write declares `@RestrictToRoles` with the same roles as its REST twin (`POST /support/tickets`).
 * - Identity comes only from the server-injected `_tenantId` / `_userDbId`; the schemas take no tenant or user field,
 *   and the pipeline drops any `_` key a caller sends.
 * - Errors are thrown as `HttpException`s (from the service) or left to the pipeline, which never hands a raw
 *   message to an agent.
 *
 * Safe to delete. To remove it: delete this file, remove `SupportTicketTool` (and `SupportModule`, if nothing else
 * needs it) from `mcp-tools.module.ts`, and remove the two `*_SUPPORT_TICKET*` entries from `tool-names.constants.ts`.
 */
interface ServerArgs {
  _tenantId: number;
  _userDbId: number;
}

const TICKET_SUMMARY = (ticket: {
  ticketNumber: string;
  subject: string;
  status: string;
  category: string;
  priority: string;
  messageCount: number;
  createdAt: Date;
}) => ({
  ticketNumber: ticket.ticketNumber,
  subject: ticket.subject,
  status: ticket.status,
  category: ticket.category,
  priority: ticket.priority,
  messageCount: ticket.messageCount,
  createdAt: ticket.createdAt,
});

@Injectable()
export class SupportTicketTool {
  constructor(private readonly support: SupportService) {}

  @RequiresScope('platform:read')
  @Tool({
    name: ToolNames.LIST_SUPPORT_TICKETS,
    description:
      "List this workspace's support tickets, newest first. Use it when the user asks about tickets they or their team raised. Returns the ticket number, subject, status, category and priority of each, and a cursor for the next page.",
    parameters: z.object({
      status: SupportStatusSchema.optional().describe('Only tickets in this status'),
      limit: z.number().int().min(1).max(50).default(10).describe('How many tickets to return'),
      cursor: z.string().optional().describe('The nextCursor of a previous page'),
    }),
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
  })
  async listSupportTickets(
    params: { status?: z.infer<typeof SupportStatusSchema>; limit: number; cursor?: string } & ServerArgs,
  ) {
    const page = await this.support.listTicketsForTenant(params._tenantId, {
      status: params.status,
      limit: params.limit,
      cursor: params.cursor,
    });
    return {
      tickets: page.items.map(TICKET_SUMMARY),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  }

  @RequiresScope('platform:write')
  @RestrictToRoles([UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER])
  @Tool({
    name: ToolNames.CREATE_SUPPORT_TICKET,
    description:
      'Open a support ticket for this workspace, on behalf of the user. Use it only when the user asks to contact support or report a problem the assistant cannot solve. Confirm the subject and description with the user first. Returns the new ticket number.',
    parameters: z.object({
      subject: z.string().trim().min(1).max(500).describe('A one-line summary of the problem'),
      description: z.string().trim().min(1).max(10_000).describe('What happened, in the user’s own words'),
      category: SupportCategorySchema.default('GENERAL').describe('What the ticket is about'),
      priority: SupportPrioritySchema.default('MEDIUM').describe('How urgent it is for the user'),
    }),
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
    },
  })
  async createSupportTicket(
    params: {
      subject: string;
      description: string;
      category: z.infer<typeof SupportCategorySchema>;
      priority: z.infer<typeof SupportPrioritySchema>;
    } & ServerArgs,
  ) {
    const ticket = await this.support.createTicket(params._tenantId, params._userDbId, {
      subject: params.subject,
      description: params.description,
      category: params.category,
      priority: params.priority,
    });
    return { created: true, ticket: TICKET_SUMMARY(ticket) };
  }
}
