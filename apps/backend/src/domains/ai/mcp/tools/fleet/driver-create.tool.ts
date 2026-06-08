import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { DriversService } from '../../../../fleet/drivers/services/drivers.service';
import { errorResponse } from '../utils/entity-resolver';
import { RequiresScope } from '../../../agent-contract/requires-scope.decorator';
import { ToolNames } from '../../../agent-contract/tool-names.constants';

/**
 * Create-Driver MCP Tool — creates a new ACTIVE driver profile.
 *
 * Tenant isolation:
 *   - _tenantId is injected by McpToolService from the authenticated session.
 *     Never accepted from the LLM.
 *
 * Scope:
 *   - RequiresScope('fleet:write') — shared with update-driver and driver status changes.
 *     Standard HITL tier for external principals.
 *
 * Delegates to DriversService.create which generates the driverId, persists in
 * a transaction, and emits DRIVER_CREATED events.
 */

const CreateDriverSchema = z.object({
  name: z.string().min(1).describe('Driver full name, e.g. "Jane Doe"'),
  phone: z.string().min(7).optional().describe('Contact phone number'),
  email: z.string().email().optional().describe('Contact email'),
  cdlClass: z
    .enum(['A', 'B', 'C'])
    .describe('CDL class: A (tractor-trailer), B (straight truck), C (small HAZMAT / passenger)'),
  licenseNumber: z.string().min(1).describe('CDL / license number, e.g. "TX-123456"'),
  licenseState: z.string().length(2).optional().describe('Two-letter state code where CDL was issued'),
  endorsements: z.array(z.string()).optional().describe('CDL endorsements, e.g. ["HAZMAT", "TANKER"]'),
  hireDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Hire date must be YYYY-MM-DD')
    .optional(),
  medicalCardExpiry: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Medical card expiry must be YYYY-MM-DD')
    .optional(),
  homeTerminalCity: z.string().optional(),
  homeTerminalState: z.string().length(2).optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  notes: z.string().optional(),
  _tenantId: z.number().optional().describe('Internal: injected by system'),
  // _userId accepted for future provenance tracking on AgentInvocationLog; DriversService.create doesn't persist it today.
  _userId: z.string().optional().describe('Internal: injected by system'),
});

type CreateDriverArgs = z.infer<typeof CreateDriverSchema>;

@Injectable()
export class DriverCreateTool {
  constructor(private readonly driversService: DriversService) {}

  @RequiresScope('fleet:write')
  @Tool({
    name: ToolNames.CREATE_DRIVER,
    description:
      'Create a new driver profile. Use when dispatcher says "add a new driver Jane Doe, CDL class A license TX-123456, phone 555-1234" or "hire John Smith with HAZMAT endorsement, medical card expires June 2027." The driver is created in ACTIVE status and is immediately eligible for load assignment. Do NOT use to reactivate a deactivated driver (use update-driver-status). Requires user confirmation before executing.',
    parameters: CreateDriverSchema,
  })
  async createDriver(args: CreateDriverArgs) {
    const { _tenantId, _userId: _, ...rest } = args;

    if (!_tenantId) return errorResponse('Session error: no tenant context.');

    // Zod's spread-rest type loses required-field narrowing post-destructure; narrow back to the
    // service's known shape. name/cdlClass/licenseNumber are required in the schema above.
    const createData = rest as Parameters<DriversService['create']>[1];

    try {
      const driver = await this.driversService.create(_tenantId, createData);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              driverId: driver.driverId,
              name: driver.name,
              status: driver.status,
              message: `Driver ${driver.name} (${driver.driverId}) created in ACTIVE status and can be assigned to loads.`,
            }),
          },
        ],
      };
    } catch (error) {
      return errorResponse(error instanceof Error ? error.message : 'Failed to create driver.');
    }
  }
}
