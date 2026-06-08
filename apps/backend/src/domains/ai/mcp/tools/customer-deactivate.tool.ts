import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { CustomersService } from '../../../fleet/customers/services/customers.service';
import { errorResponse } from './utils/entity-resolver';
import { RequiresScope } from '../../agent-contract/requires-scope.decorator';
import { ToolNames } from '../../agent-contract/tool-names.constants';

/**
 * Deactivate-Customer MCP Tool — marks a customer INACTIVE, blocking new loads.
 *
 * Tenant isolation:
 *   - _tenantId is injected by McpToolService from the authenticated session.
 *     Never accepted from the LLM. Absent = early error before service call.
 *
 * Scope:
 *   RequiresScope('customers:write:sensitive') — sensitive tier; pipeline
 *   handles HITL step-up for external principals automatically.
 *
 * Delegates entirely to CustomersService.deactivate which enforces active-load
 * safety check, flips status to INACTIVE, and sets deactivatedAt/By/Reason.
 * Existing loads and invoices are NOT affected — only new bookings are blocked.
 */

const DeactivateCustomerSchema = z.object({
  customerName: z.string().min(1).describe('Customer company name or partial match'),
  reason: z.string().min(5).max(500).describe('Why this customer is being deactivated (audit log)'),
  _tenantId: z.number().optional().describe('Internal: injected by system'),
  _userId: z.string().optional().describe('Internal: injected by system'),
});

type DeactivateCustomerArgs = z.infer<typeof DeactivateCustomerSchema>;

@Injectable()
export class CustomerDeactivateTool {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customersService: CustomersService,
  ) {}

  @RequiresScope('customers:write:sensitive')
  @Tool({
    name: ToolNames.DEACTIVATE_CUSTOMER,
    description:
      'Deactivate a customer, preventing new load bookings. Use when admin says "deactivate Acme — they went out of business" or "put XYZ on freeze, they\'re not paying." Existing loads and invoices remain — this does NOT void money. Customer must have no active loads (ASSIGNED / IN_TRANSIT / ON_HOLD). This is a sensitive action requiring step-up confirmation for external agents. Reversible only via the UI (no reactivate tool). Requires user confirmation before executing.',
    parameters: DeactivateCustomerSchema,
  })
  async deactivateCustomer(args: DeactivateCustomerArgs) {
    const { _tenantId, _userId, customerName, reason } = args;

    if (!_tenantId) return errorResponse('Session error: no tenant context.');
    if (!_userId)
      return errorResponse('Session error: no user context. Sensitive writes must be attributable to a user.');

    const user = await this.prisma.user.findFirst({
      where: { userId: _userId, tenantId: _tenantId },
      select: { id: true },
    });
    if (!user) return errorResponse('Acting user not found.');

    const customers = await this.prisma.customer.findMany({
      where: {
        companyName: { contains: customerName, mode: 'insensitive' },
        tenantId: _tenantId,
      },
      take: 5,
    });

    if (customers.length === 0) return errorResponse(`No customer found matching "${customerName}".`);
    if (customers.length > 1)
      return errorResponse(
        `Multiple customers match "${customerName}": ${customers.map((c) => c.companyName).join(', ')}. Please be more specific.`,
      );

    const customer = customers[0];

    try {
      await this.customersService.deactivate(customer.customerId, _tenantId, user.id, reason);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              customerId: customer.customerId,
              companyName: customer.companyName,
              message: `Customer ${customer.companyName} deactivated. No new loads can be booked. Existing invoices remain.`,
            }),
          },
        ],
      };
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : (error?.response?.message ?? 'Failed to deactivate customer.');
      return errorResponse(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
  }
}
