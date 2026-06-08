import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { SupportService } from '../../../operations/support/support.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { RequiresScope } from '../../agent-contract/requires-scope.decorator';

/**
 * Support Ticket MCP Tool — allows Sally AI to create support tickets.
 *
 * Used in the embedded support chat on /settings/support. When Sally cannot
 * resolve the user's issue, she calls this tool to create a ticket with full
 * conversation context and any related entities discovered during the chat.
 *
 * All queries are tenant-scoped via `_tenantId`, which is injected by
 * McpToolService from the authenticated session — NEVER from AI input.
 */
@Injectable()
export class SupportTicketTool {
  constructor(
    private readonly supportService: SupportService,
    private readonly prisma: PrismaService,
  ) {}

  @RequiresScope('platform:write')
  @Tool({
    name: 'create-support-ticket',
    description:
      'Create a support ticket when you cannot resolve the user\'s issue. Use when the user says "I need to talk to someone" or "create a ticket" after you\'ve been unable to help. Include subject, detailed description of what was investigated, category, priority, and any related entities (loads, invoices, drivers) discovered in the conversation. Do NOT call this proactively — only escalate when the user has confirmed they want a ticket. Requires user confirmation before executing.',
    parameters: z.object({
      subject: z.string().max(200).describe('Brief summary of the issue (max 200 chars)'),
      description: z
        .string()
        .describe(
          'Detailed description: what the user reported, what you investigated, and why it needs human attention',
        ),
      category: z
        .enum(['BILLING', 'TECHNICAL', 'FEATURE_REQUEST', 'ACCOUNT', 'INTEGRATION', 'GENERAL'])
        .describe('Category that best fits the issue'),
      priority: z
        .enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'])
        .describe(
          'Priority based on urgency: CRITICAL if blocking operations, HIGH if impacting workflow, MEDIUM for inconveniences, LOW for suggestions',
        ),
      relatedEntities: z
        .array(
          z.object({
            type: z.string().describe('Entity type: load, invoice, driver, vehicle, etc.'),
            id: z.string().describe('Entity ID'),
            label: z.string().optional().describe('Human-readable label (e.g., "Load #L-4521")'),
          }),
        )
        .optional()
        .describe('Entities related to the issue that you discovered'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
      _conversationId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async createSupportTicket({
    subject,
    description,
    category,
    priority,
    relatedEntities,
    _tenantId,
    _userId,
    _conversationId,
  }: {
    subject: string;
    description: string;
    category: string;
    priority: string;
    relatedEntities?: Array<{ type: string; id: string; label?: string }>;
    _tenantId?: number;
    _userId?: string;
    _conversationId?: string;
  }) {
    if (!_tenantId || !_userId) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: 'No tenant context' }),
          },
        ],
      };
    }

    try {
      const user = await this.prisma.user.findFirst({
        where: { userId: _userId, tenantId: _tenantId },
        select: { id: true },
      });
      if (!user) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: 'User not found' }),
            },
          ],
        };
      }

      let conversationId: number | undefined;
      if (_conversationId) {
        const conv = await this.prisma.conversation.findFirst({
          where: { conversationId: _conversationId, tenantId: _tenantId },
          select: { id: true },
        });
        conversationId = conv?.id;
      }

      const ticket = await this.supportService.createTicket(_tenantId, user.id, {
        subject,
        description,
        category,
        priority,
        conversationId,
        relatedEntities,
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              ticketNumber: ticket.ticketNumber,
              status: ticket.status,
              message: `Support ticket ${ticket.ticketNumber} has been created. Our team will review it and respond. You can track the status in the "My Tickets" tab.`,
            }),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: error.message ?? 'Failed to create support ticket',
            }),
          },
        ],
      };
    }
  }
}
