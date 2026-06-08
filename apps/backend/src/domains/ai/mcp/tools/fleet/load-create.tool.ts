import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { formatLoadLabel } from '@sally/shared-types';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { errorResponse } from '../utils/entity-resolver';
import { LoadsService } from '../../../../fleet/loads/services/loads.service';
import { RequiresScope } from '../../../agent-contract/requires-scope.decorator';
import { ToolNames } from '../../../agent-contract/tool-names.constants';

/**
 * Load Create MCP Tool — creates a new load with pickup and dropoff stops.
 *
 * Tenant-scoping guarantee: `_tenantId` is injected by McpToolService from
 * the authenticated session and is never sourced from AI input. All Prisma
 * queries are hard-scoped to that tenantId.
 *
 * Scope requirement: loads:write
 * Intake source is set to 'agent' so agent-originated loads are identifiable
 * in analytics, and the manual-intake customerId guard is bypassed correctly.
 */

const CreateLoadSchema = z.object({
  customerName: z.string().describe('Customer name or partial match, e.g. "Acme Shipping"'),
  pickup: z.object({
    name: z.string().describe('Pickup facility name, e.g. "Acme Dallas DC"'),
    address: z.string().describe('Pickup street address'),
    city: z.string(),
    state: z.string().length(2).describe('Two-letter state code'),
    zipCode: z.string(),
    appointmentDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe('Pickup date YYYY-MM-DD'),
    estimatedDockHours: z.number().min(0).max(24).default(2),
  }),
  dropoff: z.object({
    name: z.string().describe('Dropoff facility name'),
    address: z.string(),
    city: z.string(),
    state: z.string().length(2),
    zipCode: z.string(),
    appointmentDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe('Dropoff date YYYY-MM-DD'),
    estimatedDockHours: z.number().min(0).max(24).default(2),
  }),
  weightLbs: z.number().int().min(0).describe('Load weight in pounds'),
  commodityType: z.string().describe('Commodity description, e.g. "dry goods", "frozen food"'),
  rateCents: z.number().int().min(0).optional().describe('Customer rate in CENTS (e.g. $2,400 → 240000)'),
  equipmentType: z.enum(['DRY_VAN', 'REEFER', 'FLATBED', 'STEP_DECK', 'POWER_ONLY']).optional(),
  // Named 'referenceNumber' to match LoadsService.create — surfaces as "ref number" in UI and BOL.
  referenceNumber: z.string().optional().describe('Load reference number (BOL / broker ref)'),
  specialRequirements: z.string().optional(),
  _tenantId: z.number().optional().describe('Internal: injected by system'),
  _userId: z.string().optional().describe('Internal: injected by system'),
});

type CreateLoadArgs = z.infer<typeof CreateLoadSchema>;

@Injectable()
export class LoadCreateTool {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loadsService: LoadsService,
  ) {}

  private buildStops(pickup: CreateLoadArgs['pickup'], dropoff: CreateLoadArgs['dropoff']) {
    const makeStop = (stop: typeof pickup, sequenceOrder: number, actionType: string) => ({
      stopId: `STOP-${randomUUID().slice(0, 12)}`,
      sequenceOrder,
      actionType,
      estimatedDockHours: stop.estimatedDockHours,
      appointmentDate: stop.appointmentDate,
      name: stop.name,
      address: stop.address,
      city: stop.city,
      state: stop.state,
      zipCode: stop.zipCode,
    });
    return [makeStop(pickup, 1, 'PICKUP'), makeStop(dropoff, 2, 'DROPOFF')];
  }

  private async resolveCustomer(customerName: string, tenantId: number) {
    const customers = await this.prisma.customer.findMany({
      where: {
        companyName: { contains: customerName, mode: 'insensitive' as const },
        tenantId,
      },
      take: 5,
    });
    if (customers.length === 0)
      return {
        error: `No customer found matching "${customerName}". Create the customer first via create-customer.`,
      };
    if (customers.length > 1)
      return {
        error: `Multiple customers match "${customerName}": ${customers.map((c) => c.companyName).join(', ')}. Please be more specific.`,
      };
    return { customer: customers[0] };
  }

  @RequiresScope('loads:write')
  @Tool({
    name: ToolNames.CREATE_LOAD,
    description:
      'Create a new load with pickup and dropoff stops for a known customer. Use when dispatcher says "create a load for Acme, Dallas to Houston, $2,400, pickup Friday, deliver Saturday, 15,000 lbs dry goods." Load is created in PENDING status — use assign-load afterward to set a driver and vehicle. Customer must already exist (use create-customer first if needed). Do NOT use to promote a parsed rate-con draft (use accept-ratecon-draft). Requires user confirmation before executing.',
    parameters: CreateLoadSchema,
  })
  async createLoad(args: CreateLoadArgs) {
    const {
      customerName,
      pickup,
      dropoff,
      weightLbs,
      commodityType,
      rateCents,
      equipmentType,
      referenceNumber,
      specialRequirements,
      _tenantId,
      // _userId accepted for future provenance tracking on AgentInvocationLog; LoadsService.create doesn't persist it today.
      _userId: _,
    } = args;

    if (!_tenantId) return errorResponse('Session error: no tenant context.');

    const resolved = await this.resolveCustomer(customerName, _tenantId);
    if (resolved.error) return errorResponse(resolved.error);
    const customer = resolved.customer;

    try {
      const load = await this.loadsService.create({
        tenantId: _tenantId,
        customerName: customer.companyName,
        customerId: customer.id,
        weightLbs,
        commodityType,
        ...(rateCents !== undefined && { rateCents }),
        ...(equipmentType !== undefined && { equipmentType }),
        ...(referenceNumber !== undefined && { referenceNumber }),
        ...(specialRequirements !== undefined && { specialRequirements }),
        intakeSource: 'agent',
        stops: this.buildStops(pickup, dropoff),
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              loadNumber: load.loadNumber,
              loadLabel: formatLoadLabel(load.loadNumber, load.referenceNumber),
              status: load.status,
              message: `${formatLoadLabel(load.loadNumber, load.referenceNumber)} created. Next step: use assign-load to assign a driver and vehicle.`,
            }),
          },
        ],
      };
    } catch (error) {
      return errorResponse(error instanceof Error ? error.message : 'Failed to create load.');
    }
  }
}
