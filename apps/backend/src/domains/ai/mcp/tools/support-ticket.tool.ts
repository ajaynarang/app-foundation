import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { UserRole } from '@appshore/db';
import { SupportCategorySchema, SupportPrioritySchema, SupportStatusSchema } from '@app/shared-types';
import { SupportService } from '../../../support/support.service';
import { RequiresScope } from '../../agent-contract/requires-scope.decorator';
import { RestrictToRoles } from '../../agent-contract/tool-policy.decorator';
import { ToolNames } from '../../agent-contract/tool-names.constants';
import { idempotencyKeyArg } from '../../agent-contract/tool-idempotency';

/**
 * Example tools: a read and two writes over the existing support desk, showing every rule a product's own tools
 * follow. All call `SupportService`; none adds a model. `reply-to-support-ticket` is also the act of the reference
 * Desk job (`domains/desk/responsibilities/support-followup`).
 *
 * - Each method declares `@RequiresScope`; the write's scope (`platform:write`) makes it a write everywhere: chat
 *   offers `confirm-action` and runs it only against the person's confirmed card, an external agent is challenged,
 *   MCP clients see it as not read-only.
 * - Each write declares `@RestrictToRoles` with the same roles as its REST twin (`POST /support/tickets`,
 *   `POST /support/tickets/:id/messages`).
 * - Each write is a create with no natural key, so it declares `idempotencyKey: idempotencyKeyArg`: an agent that
 *   retries with the same key and arguments gets the first ticket back instead of a second one. The executor takes
 *   the key out before the method runs, so the method never sees it.
 * - Identity comes only from the server-injected `_tenantId` / `_userDbId`; the schemas take no tenant or user field,
 *   and the pipeline drops any `_` key a caller sends.
 * - Errors are thrown as `HttpException`s (from the service) or left to the pipeline, which never hands a raw
 *   message to an agent.
 *
 * Safe to delete. To remove it: delete this file, remove `SupportTicketTool` (and `SupportModule`, if nothing else
 * needs it) from `mcp-tools.module.ts`, and remove the `*_SUPPORT_TICKET*` entries from `tool-names.constants.ts`. The
 * reference Desk job goes with it: delete its folder and its registrations (listed in that folder's `definition.ts`).
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
      idempotencyKey: idempotencyKeyArg,
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

  @RequiresScope('platform:write')
  @RestrictToRoles([UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER])
  @Tool({
    name: ToolNames.REPLY_TO_SUPPORT_TICKET,
    description:
      'Add a reply to one of this workspace’s own support tickets, on behalf of the user. Use it to answer a question from support or to ask for an update on a ticket that has gone quiet. Confirm the wording with the user first. Returns the ticket number and when the reply was posted.',
    parameters: z.object({
      ticketNumber: z.string().trim().min(1).max(20).describe('The ticket to reply on, for example ST-1001'),
      content: z.string().trim().min(1).max(10_000).describe('The reply, as plain text'),
      idempotencyKey: idempotencyKeyArg,
    }),
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
    },
  })
  async replyToSupportTicket(params: { ticketNumber: string; content: string } & ServerArgs) {
    const message = await this.support.addMessageByTicketNumber(
      params._tenantId,
      params.ticketNumber,
      params._userDbId,
      params.content,
    );
    return { replied: true, ticketNumber: params.ticketNumber, postedAt: message.createdAt };
  }
}
