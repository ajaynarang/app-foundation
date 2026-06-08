import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { CustomersService } from '../../../fleet/customers/services/customers.service';
import { InvoicingService } from '../../../financials/invoicing/services/invoicing.service';
import { RequiresScope } from '../../agent-contract/requires-scope.decorator';

/**
 * Customer MCP Tools — read-only tools for dispatcher customer queries.
 *
 * All queries are tenant-scoped via `_tenantId`, which is injected by
 * McpToolService from the authenticated session — NEVER from AI input.
 * The AI cannot see or override the _tenantId parameter.
 */
@Injectable()
export class CustomerTool {
  constructor(
    private readonly customersService: CustomersService,
    private readonly invoicingService: InvoicingService,
  ) {}

  @RequiresScope('customers:read')
  @Tool({
    name: 'query-customers',
    description:
      "Search customers for the current tenant. Optionally filter by name (case-insensitive partial match) and include inactive customers. Returns up to 20 customers with company name, contact info, payment terms, and active status. Do NOT use for a single customer's full profile — use get-customer-detail.",
    parameters: z.object({
      search: z.string().optional().describe('Filter by customer name (case-insensitive partial match)'),
      includeInactive: z.boolean().optional().describe('If true, include inactive customers in results'),
      limit: z.number().min(1).max(50).default(20).describe('Max results to return'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async queryCustomers({
    search,
    includeInactive,
    limit,
    _tenantId,
  }: {
    search?: string;
    includeInactive?: boolean;
    limit: number;
    _tenantId?: number;
    _userId?: string;
  }) {
    if (!_tenantId) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: 'No tenant context' }),
          },
        ],
      };
    }

    let customers = await this.customersService.findAll(_tenantId, includeInactive);

    // Client-side name filter
    if (search) {
      const term = search.toLowerCase();
      customers = customers.filter((c: any) => c.companyName?.toLowerCase().includes(term));
    }

    // Apply limit
    customers = customers.slice(0, limit);

    const mapped = customers.map((c: any) => {
      const primary = c.contacts?.find((ct: any) => ct.isPrimary) ?? c.contacts?.[0];
      return {
        id: c.customerId,
        companyName: c.companyName,
        contactEmail: primary?.email ?? null,
        contactPhone: primary?.phone ?? null,
        paymentTerms: c.paymentTerms,
        isActive: c.status !== 'INACTIVE',
      };
    });

    const cardData = {
      customers: mapped,
      totalCount: mapped.length,
    };

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            count: mapped.length,
            customers: mapped,
          }),
        },
      ],
      _card: { type: 'customer_list' as const, data: cardData },
    };
  }

  @RequiresScope('customers:read')
  @Tool({
    name: 'get-customer-detail',
    description:
      'Get full details for a single customer by their customer ID (e.g. cust_abc123). Returns company info, contact details, payment terms, billing address, portal access status, and contacts.',
    parameters: z.object({
      customerId: z.string().describe('The customer ID (e.g. cust_abc123)'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async getCustomerDetail({ customerId, _tenantId }: { customerId: string; _tenantId?: number; _userId?: string }) {
    if (!_tenantId) {
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
      const customer = await this.customersService.findOne(customerId, _tenantId);

      const primary = (customer as any).contacts?.find((ct: any) => ct.isPrimary) ?? (customer as any).contacts?.[0];
      const cardData = {
        id: customer.customerId,
        companyName: customer.companyName,
        contactEmail: primary?.email ?? null,
        contactPhone: primary?.phone ?? null,
        paymentTerms: customer.paymentTerms,
        isActive: customer.status === 'ACTIVE',
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(customer),
          },
        ],
        _card: { type: 'customer' as const, data: cardData },
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: error?.message ?? `Customer ${customerId} not found`,
            }),
          },
        ],
      };
    }
  }

  @RequiresScope('customers:read')
  @Tool({
    name: 'get-customer-payment-stats',
    description:
      'Get payment behavior statistics for a customer: average days to pay, reliability rating, total invoices paid, and outstanding balance. Requires the internal numeric customer ID.',
    parameters: z.object({
      customerId: z.string().describe('The customer ID (e.g. cust_abc123). Will be resolved to internal numeric ID.'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async getCustomerPaymentStats({
    customerId,
    _tenantId,
  }: {
    customerId: string;
    _tenantId?: number;
    _userId?: string;
  }) {
    if (!_tenantId) {
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
      // Resolve the string customerId to the internal numeric id
      const customer = await this.customersService.findOne(customerId, _tenantId);
      const numericId = (customer as any).id;

      const stats = await this.invoicingService.getCustomerPaymentStats(_tenantId, numericId);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(stats),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: error?.message ?? `Failed to get payment stats for customer ${customerId}`,
            }),
          },
        ],
      };
    }
  }
}
