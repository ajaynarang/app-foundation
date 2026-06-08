import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { EmailService } from '../../../../infrastructure/notification/services/email.service';
import { errorResponse } from './utils/entity-resolver';
import { RequiresScope } from '../../agent-contract/requires-scope.decorator';
import { ToolNames } from '../../agent-contract/tool-names.constants';

/**
 * Send-Customer-Message MCP Tool — sends an email to a customer contact.
 *
 * Tenant isolation:
 *   - _tenantId is injected by McpToolService from the authenticated session.
 *     Never sourced from the LLM. Absent = early error.
 *
 * Scope:
 *   - RequiresScope('comms:send') — standard HITL tier for outbound comms.
 *
 * Customer resolution: inline Prisma lookup by companyName (insensitive
 * contains). Zero matches → not found error. Multiple → disambiguation error.
 *
 * Contact role: the Customer model stores a single billingEmail field; it does
 * not have separate role-broken-down contact records. All roles (primary,
 * billing, dispatch) resolve to billingEmail as the universal fallback.
 * If billingEmail is null for any role, returns a user-friendly error.
 *
 * Delegates to EmailService.sendEmail (global @Injectable provider).
 */

const SendCustomerMessageSchema = z.object({
  customerName: z.string().min(1).describe('Customer company name or partial match'),
  contactRole: z.enum(['primary', 'billing', 'dispatch']).default('primary').describe('Which contact role to email'),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(4000),
  _tenantId: z.number().optional().describe('Internal: injected by system'),
  _userId: z.string().optional().describe('Internal: injected by system'),
});

type SendCustomerMessageArgs = z.infer<typeof SendCustomerMessageSchema>;

@Injectable()
export class CommsCustomerTool {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  @RequiresScope('comms:send')
  @Tool({
    name: ToolNames.SEND_CUSTOMER_MESSAGE,
    description:
      'Send an email to a customer contact. Use when dispatcher says "email Acme billing about invoice #4521" or "let Acme know we\'re running 45 minutes late on the 2pm pickup." Default contact role is \'primary\'. Max body 4,000 chars. Do NOT use for system-generated invoice emails (those are automatic). Requires user confirmation before executing.',
    parameters: SendCustomerMessageSchema,
  })
  async sendCustomerMessage(args: SendCustomerMessageArgs) {
    const { _tenantId, _userId: _, customerName, contactRole, subject, body } = args;

    if (!_tenantId) return errorResponse('Session error: no tenant context.');

    const customers = await this.prisma.customer.findMany({
      where: {
        companyName: { contains: customerName, mode: 'insensitive' },
        tenantId: _tenantId,
      },
      take: 5,
    });

    if (customers.length === 0) {
      return errorResponse(`No customer found matching "${customerName}".`);
    }
    if (customers.length > 1) {
      return errorResponse(
        `Multiple customers match "${customerName}": ${customers.map((c) => c.companyName).join(', ')}. Please be more specific.`,
      );
    }

    const customer = customers[0];
    // Customer model has billingEmail as the single contact field.
    // All contactRole values (primary, billing, dispatch) resolve to billingEmail.
    const recipientEmail = customer.billingEmail ?? null;

    if (!recipientEmail) {
      return errorResponse(`Customer ${customer.companyName} has no email on file for role '${contactRole}'.`);
    }

    try {
      await this.emailService.sendEmail({
        to: recipientEmail,
        subject,
        text: body,
        html: body,
      });
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              customerName: customer.companyName,
              to: recipientEmail,
              message: `Email sent to ${customer.companyName} at ${recipientEmail}.`,
            }),
          },
        ],
      };
    } catch (error) {
      return errorResponse(error instanceof Error ? error.message : 'Failed to send email.');
    }
  }
}
