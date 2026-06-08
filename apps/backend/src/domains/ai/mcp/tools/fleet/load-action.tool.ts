import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { formatLoadLabel } from '@app/shared-types';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { EntityResolver, errorResponse } from '../utils/entity-resolver';
import { LoadsService } from '../../../../fleet/loads/services/loads.service';
import { LoadNotesService } from '../../../../fleet/loads/services/load-notes.service';
import { RequiresScope } from '../../../agent-contract/requires-scope.decorator';
import { ToolNames } from '../../../agent-contract/tool-names.constants';

/**
 * Load Action MCP Tools — mutation tools for load operations.
 *
 * All queries are tenant-scoped via `_tenantId`, which is injected by
 * McpToolService from the authenticated session — NEVER from AI input.
 * The AI cannot see or override the _tenantId parameter.
 */
@Injectable()
export class LoadActionTool {
  private readonly resolver: EntityResolver;

  constructor(
    private readonly prisma: PrismaService,
    private readonly loadsService: LoadsService,
    private readonly loadNotesService: LoadNotesService,
  ) {
    this.resolver = new EntityResolver(prisma);
  }

  @RequiresScope('loads:write')
  @Tool({
    name: ToolNames.ASSIGN_LOAD,
    description:
      'Assign a driver and vehicle to a pending load. Auto-transitions load to assigned. Use when dispatcher says "give load 1045 to John" or "assign driver Smith to L-1045." Requires user confirmation before executing.',
    parameters: z.object({
      loadNumber: z.string().describe('Load number to assign, e.g. "L-1045" or "1045"'),
      driverName: z.string().describe('Driver name or partial name, e.g. "John Smith" or "Smith"'),
      vehicleUnit: z.string().describe('Vehicle unit number, e.g. "T-101" or "101"'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async assignLoad({
    loadNumber,
    driverName,
    vehicleUnit,
    _tenantId,
  }: {
    loadNumber: string;
    driverName: string;
    vehicleUnit: string;
    _tenantId?: number;
    _userId?: string;
  }) {
    if (!_tenantId) return errorResponse('Tenant context is required.');

    const loadResult = await this.resolver.resolveLoad(loadNumber, _tenantId);
    if ('error' in loadResult) return errorResponse(loadResult.error);

    const driverResult = await this.resolver.resolveDriver(driverName, _tenantId);
    if ('error' in driverResult) return errorResponse(driverResult.error);

    const vehicleResult = await this.resolver.resolveVehicle(vehicleUnit, _tenantId);
    if ('error' in vehicleResult) return errorResponse(vehicleResult.error);

    const load = loadResult.data;
    const driver = driverResult.data;
    const vehicle = vehicleResult.data;

    try {
      await this.loadsService.assignLoad(load.loadNumber, driver.driverId, vehicle.vehicleId);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: `${formatLoadLabel(load.loadNumber, load.referenceNumber)} assigned to driver ${driver.name} with vehicle ${vehicle.unitNumber}.`,
              loadNumber: load.loadNumber,
              loadLabel: formatLoadLabel(load.loadNumber, load.referenceNumber),
              driverName: driver.name,
              vehicleUnit: vehicle.unitNumber,
            }),
          },
        ],
      };
    } catch (error) {
      return errorResponse(error instanceof Error ? error.message : 'Failed to assign load.');
    }
  }

  @RequiresScope('loads:write')
  @Tool({
    name: ToolNames.UPDATE_LOAD_STATUS,
    description:
      'Change a load status: PENDING, IN_TRANSIT, ON_HOLD, DELIVERED, CANCELLED, TONU. Use when dispatcher says "put L-1045 on hold" or "mark 1045 delivered." Do NOT use for field edits (use update-load) or assigning drivers (use assign-load). Requires user confirmation before executing.',
    parameters: z.object({
      loadNumber: z.string().describe('Load number to update, e.g. "L-1045" or "1045"'),
      status: z.enum(['PENDING', 'IN_TRANSIT', 'ON_HOLD', 'DELIVERED', 'CANCELLED', 'TONU']),
      reason: z.string().optional().describe('Reason for status change. Required for ON_HOLD, CANCELLED, and TONU.'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
    }),
  })
  async updateLoadStatus({
    loadNumber,
    status,
    reason,
    _tenantId,
  }: {
    loadNumber: string;
    status: string;
    reason?: string;
    _tenantId?: number;
  }) {
    if (!_tenantId) return errorResponse('Tenant context is required.');

    if (['ON_HOLD', 'CANCELLED', 'TONU'].includes(status) && !reason) {
      return errorResponse(`A reason is required when setting status to "${status}".`);
    }

    const loadResult = await this.resolver.resolveLoad(loadNumber, _tenantId);
    if ('error' in loadResult) return errorResponse(loadResult.error);

    const load = loadResult.data;

    await this.loadsService.updateStatus(load.loadNumber, status, { reason });

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            message: `${formatLoadLabel(load.loadNumber, load.referenceNumber)} status updated to "${status}".`,
            loadNumber: load.loadNumber,
            loadLabel: formatLoadLabel(load.loadNumber, load.referenceNumber),
            status,
            ...(reason && { reason }),
          }),
        },
      ],
    };
  }

  @RequiresScope('loads:write')
  @Tool({
    name: ToolNames.UPDATE_LOAD,
    description:
      'Update editable fields on a load: rate, equipment type, commodity, weight, notes, or pickup/dropoff addresses. Use for corrections like "change load 1045 rate to $2,400" or "add commodity = reefer." Do NOT use to change status (use update-load-status) or assign drivers (use assign-load). Requires user confirmation before executing.',
    parameters: z.object({
      loadNumber: z.string().describe('Load number to update, e.g. "L-1045" or "1045"'),
      rateDollars: z.number().optional().describe('New rate in dollars, e.g. 3200'),
      weightLbs: z.number().optional().describe('New weight in pounds, e.g. 42000'),
      equipmentType: z.string().optional().describe('Equipment type, e.g. "dry_van", "reefer", "flatbed"'),
      commodityType: z.string().optional().describe('Commodity type, e.g. "general", "hazmat", "produce"'),
      referenceNumber: z.string().optional().describe('Customer or broker reference number'),
      specialRequirements: z.string().optional().describe('Special handling or delivery instructions'),
      customFieldValues: z
        .record(z.string(), z.union([z.string(), z.number()]))
        .optional()
        .describe(
          'Custom field values as key-value pairs. Use get-custom-field-definitions to discover available fields.',
        ),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
    }),
  })
  async updateLoadFields({
    loadNumber,
    rateDollars,
    weightLbs,
    equipmentType,
    commodityType,
    referenceNumber,
    specialRequirements,
    customFieldValues,
    _tenantId,
  }: {
    loadNumber: string;
    rateDollars?: number;
    weightLbs?: number;
    equipmentType?: string;
    commodityType?: string;
    referenceNumber?: string;
    specialRequirements?: string;
    customFieldValues?: Record<string, string | number>;
    _tenantId?: number;
  }) {
    if (!_tenantId) return errorResponse('Tenant context is required.');

    const loadResult = await this.resolver.resolveLoad(loadNumber, _tenantId);
    if ('error' in loadResult) return errorResponse(loadResult.error);

    const load = loadResult.data;

    const data: Record<string, unknown> = {};
    if (rateDollars !== undefined) data.rateCents = Math.round(rateDollars * 100);
    if (weightLbs !== undefined) data.weightLbs = weightLbs;
    if (equipmentType !== undefined) data.equipmentType = equipmentType;
    if (commodityType !== undefined) data.commodityType = commodityType;
    if (referenceNumber !== undefined) data.referenceNumber = referenceNumber;
    if (specialRequirements !== undefined) data.specialRequirements = specialRequirements;
    if (customFieldValues !== undefined) data.customFieldValues = customFieldValues;

    if (Object.keys(data).length === 0) {
      return errorResponse('No fields provided to update.');
    }

    await this.loadsService.updateDraft(load.loadNumber, data);

    const updatedFields = Object.keys(data)
      .map((key) => {
        if (key === 'rateCents') return `rate: $${rateDollars.toFixed(2)}`;
        return `${key}: ${JSON.stringify(data[key])}`;
      })
      .join(', ');

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            message: `${formatLoadLabel(load.loadNumber, load.referenceNumber)} updated: ${updatedFields}.`,
            loadNumber: load.loadNumber,
            loadLabel: formatLoadLabel(load.loadNumber, load.referenceNumber),
            updatedFields: data,
          }),
        },
      ],
    };
  }

  @RequiresScope('loads:write')
  @Tool({
    name: ToolNames.ADD_LOAD_NOTE,
    description:
      'Add a note to a load. Use when dispatcher says "note on L-1045: shipper closes at 5pm." Requires user confirmation before executing.',
    parameters: z.object({
      loadNumber: z.string().describe('Load number to add note to, e.g. "L-1045" or "1045"'),
      content: z.string().describe('Note content text'),
      noteType: z.enum(['general', 'dispatch', 'billing', 'safety']).default('general').describe('Type of note'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async addLoadNote({
    loadNumber,
    content,
    noteType,
    _tenantId,
    _userId,
  }: {
    loadNumber: string;
    content: string;
    noteType: string;
    _tenantId?: number;
    _userId?: string;
  }) {
    if (!_tenantId) return errorResponse('Tenant context is required.');
    if (!_userId) return errorResponse('User context is required.');

    const loadResult = await this.resolver.resolveLoad(loadNumber, _tenantId);
    if ('error' in loadResult) return errorResponse(loadResult.error);

    const load = loadResult.data;

    const user = await this.prisma.user.findFirst({
      where: { userId: _userId },
    });
    if (!user) return errorResponse('Could not resolve current user.');

    await this.loadNotesService.addNote({
      loadId: load.id,
      userId: user.id,
      content,
      noteType,
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            message: `Note added to ${formatLoadLabel(load.loadNumber, load.referenceNumber)}.`,
            loadNumber: load.loadNumber,
            loadLabel: formatLoadLabel(load.loadNumber, load.referenceNumber),
            noteType,
          }),
        },
      ],
    };
  }

  @RequiresScope('loads:write')
  @Tool({
    name: ToolNames.DUPLICATE_LOAD,
    description:
      'Duplicate an existing load as a new draft. Copies customer, stops, equipment, rate. Use when dispatcher says "copy load L-1045" or "same load again." Requires user confirmation before executing.',
    parameters: z.object({
      loadNumber: z.string().describe('Load number to duplicate, e.g. "L-1045" or "1045"'),
      pickupDate: z.string().optional().describe('Pickup date for the new load (ISO date, e.g. 2026-04-01)'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
    }),
  })
  async duplicateLoad({
    loadNumber,
    pickupDate,
    _tenantId,
  }: {
    loadNumber: string;
    pickupDate?: string;
    _tenantId?: number;
  }) {
    if (!_tenantId) return errorResponse('Tenant context is required.');

    const loadResult = await this.resolver.resolveLoad(loadNumber, _tenantId);
    if ('error' in loadResult) return errorResponse(loadResult.error);

    const load = loadResult.data;

    try {
      const newLoad = await this.loadsService.duplicate(load.loadNumber, _tenantId);

      // Update pickup date if provided
      if (pickupDate) {
        await this.prisma.load.update({
          where: { id: newLoad.id },
          data: { pickupDate: new Date(pickupDate) },
        });
      }

      const originalLabel = formatLoadLabel(load.loadNumber, load.referenceNumber);
      const newLabel = formatLoadLabel(
        newLoad.loadNumber,
        (newLoad as { referenceNumber?: string | null }).referenceNumber,
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: `${originalLabel} duplicated as ${newLabel}.`,
              originalLoadNumber: load.loadNumber,
              originalLoadLabel: originalLabel,
              newLoadNumber: newLoad.loadNumber,
              newLoadLabel: newLabel,
            }),
          },
        ],
      };
    } catch (error) {
      return errorResponse(error instanceof Error ? error.message : 'Failed to duplicate load.');
    }
  }
}
