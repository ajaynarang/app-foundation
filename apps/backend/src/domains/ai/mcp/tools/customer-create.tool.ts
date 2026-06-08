import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { CustomersService } from '../../../fleet/customers/services/customers.service';
import { errorResponse } from './utils/entity-resolver';
import { RequiresScope } from '../../agent-contract/requires-scope.decorator';
import { ToolNames } from '../../agent-contract/tool-names.constants';

/**
 * Create-Customer MCP Tool — creates a new customer (shipper, broker, or consignee).
 *
 * Tenant isolation:
 *   - _tenantId is injected by McpToolService from the authenticated session.
 *     Never accepted from the LLM. Absent = early error before service call.
 *
 * Scope:
 *   - RequiresScope('customers:write') — standard write tier for external principals.
 *
 * Delegates entirely to CustomersService.create which handles ID generation,
 * transaction, custom-field validation, and CUSTOMER_CREATED event emission.
 *
 * Schema exposes fields dispatchers use in conversational context; low-frequency
 * fields (address, billingAddress, taxId, etc.) are omitted — service layer
 * defaults them to null.
 */

const CreateCustomerSchema = z.object({
  companyName: z.string().min(1).describe('Customer company name, e.g. "Acme Shipping"'),
  customerType: z.enum(['SHIPPER', 'BROKER', 'CONSIGNEE']).optional().describe('Defaults to SHIPPER'),
  mcNumber: z.string().optional().describe('Motor Carrier number'),
  dotNumber: z.string().optional().describe('DOT number'),
  billingEmail: z.string().email().optional(),
  paymentTerms: z
    .enum(['NET_15', 'NET_30', 'NET_45', 'NET_60'])
    .optional()
    .describe('Defaults to NET_30 at service layer'),
  creditLimit: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Credit limit in DOLLARS (not cents — matches CustomersService.create)'),
  notes: z.string().optional(),
  _tenantId: z.number().optional().describe('Internal: injected by system'),
  // _userId accepted for future provenance tracking on AgentInvocationLog; CustomersService.create doesn't persist it today.
  _userId: z.string().optional().describe('Internal: injected by system'),
});

type CreateCustomerArgs = z.infer<typeof CreateCustomerSchema>;

@Injectable()
export class CustomerCreateTool {
  constructor(private readonly customersService: CustomersService) {}

  @RequiresScope('customers:write')
  @Tool({
    name: ToolNames.CREATE_CUSTOMER,
    description:
      'Create a new customer (shipper, broker, or consignee). Use when dispatcher says "add a new shipper Acme Shipping, NET 30, credit limit $50,000" or "register broker XYZ Logistics, MC 123456." Defaults: customerType=SHIPPER, paymentTerms=NET_30. Requires user confirmation before executing.',
    parameters: CreateCustomerSchema,
  })
  async createCustomer(args: CreateCustomerArgs) {
    const { _tenantId, _userId: _, ...rest } = args;

    if (!_tenantId) return errorResponse('Session error: no tenant context.');

    // Spread-rest loses required-field narrowing; cast to the service's known shape.
    const createData = { tenantId: _tenantId, ...rest } as Parameters<CustomersService['create']>[0];

    try {
      const customer = await this.customersService.create(createData);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              customerId: customer.customerId,
              companyName: customer.companyName,
              message: `Customer ${customer.companyName} created.`,
            }),
          },
        ],
      };
    } catch (error) {
      return errorResponse(error instanceof Error ? error.message : 'Failed to create customer.');
    }
  }
}
