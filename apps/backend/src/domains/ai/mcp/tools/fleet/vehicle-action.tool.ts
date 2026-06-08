import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { EntityResolver, errorResponse } from '../utils/entity-resolver';
import { VehiclesService } from '../../../../fleet/vehicles/services/vehicles.service';
import { RequiresScope } from '../../../agent-contract/requires-scope.decorator';
import { ToolNames } from '../../../agent-contract/tool-names.constants';

/**
 * Vehicle Action MCP Tools — mutation tools for vehicle field updates and lifecycle changes.
 *
 * All queries are tenant-scoped via `_tenantId`, which is injected by
 * McpToolService from the authenticated session — NEVER from AI input.
 * The AI cannot see or override the _tenantId parameter.
 */
@Injectable()
export class VehicleActionTool {
  private readonly resolver: EntityResolver;

  constructor(
    private readonly prisma: PrismaService,
    private readonly vehiclesService: VehiclesService,
  ) {
    this.resolver = new EntityResolver(prisma);
  }

  @RequiresScope('fleet:write')
  @Tool({
    name: ToolNames.UPDATE_VEHICLE,
    description:
      'Update a vehicle\'s operational fields: fuel level, license plate, make, model, year, or assigned driver. Use for edits like "update truck 101 fuel to 50 gallons" or "set license plate on T-101 to XYZ-789." Do NOT use for deactivate/decommission or status changes — use update-vehicle-status. Requires user confirmation before executing.',
    parameters: z.object({
      vehicleUnit: z.string().describe('Vehicle unit number, e.g. "T-101" or "101"'),
      currentFuelGallons: z.number().optional().describe('Current fuel level in gallons'),
      licensePlate: z.string().optional().describe('License plate number'),
      licensePlateState: z.string().optional().describe('License plate state, e.g. "TX"'),
      make: z.string().optional().describe('Vehicle make, e.g. "Freightliner"'),
      model: z.string().optional().describe('Vehicle model, e.g. "Cascadia"'),
      year: z.number().optional().describe('Vehicle year, e.g. 2024'),
      assignedDriverName: z
        .string()
        .optional()
        .describe('Driver name to assign to this vehicle. Pass empty string to unassign.'),
      customFieldValues: z
        .record(z.string(), z.union([z.string(), z.number()]))
        .optional()
        .describe(
          'Custom field values as key-value pairs. Use get-custom-field-definitions to discover available fields.',
        ),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
    }),
  })
  async updateVehicleFields({
    vehicleUnit,
    currentFuelGallons,
    licensePlate,
    licensePlateState,
    make,
    model,
    year,
    assignedDriverName,
    customFieldValues,
    _tenantId,
  }: {
    vehicleUnit: string;
    currentFuelGallons?: number;
    licensePlate?: string;
    licensePlateState?: string;
    make?: string;
    model?: string;
    year?: number;
    assignedDriverName?: string;
    customFieldValues?: Record<string, string | number>;
    _tenantId?: number;
  }) {
    if (!_tenantId) return errorResponse('Session error: no tenant context.');

    const vehicleResult = await this.resolver.resolveVehicle(vehicleUnit, _tenantId);
    if ('error' in vehicleResult) return errorResponse(vehicleResult.error);

    const vehicle = vehicleResult.data;

    // Resolve driver if assignedDriverName is provided
    let assignedDriverId: number | null | undefined;
    if (assignedDriverName !== undefined) {
      if (assignedDriverName === '') {
        // Unassign driver
        assignedDriverId = null;
      } else {
        const driverResult = await this.resolver.resolveDriver(assignedDriverName, _tenantId);
        if ('error' in driverResult) return errorResponse(driverResult.error);
        assignedDriverId = driverResult.data.id;
      }
    }

    // Build update data — only include fields that were provided
    const updateData: Record<string, unknown> = {};
    if (currentFuelGallons !== undefined) updateData.currentFuelGallons = currentFuelGallons;
    if (licensePlate !== undefined) updateData.licensePlate = licensePlate;
    if (licensePlateState !== undefined) updateData.licensePlateState = licensePlateState;
    if (make !== undefined) updateData.make = make;
    if (model !== undefined) updateData.model = model;
    if (year !== undefined) updateData.year = year;
    if (assignedDriverId !== undefined) updateData.assignedDriverId = assignedDriverId;
    if (customFieldValues !== undefined) updateData.customFieldValues = customFieldValues;

    if (Object.keys(updateData).length === 0) {
      return errorResponse('No fields provided to update.');
    }

    try {
      await this.vehiclesService.update(vehicle.vehicleId, _tenantId, updateData);

      const updatedFields = Object.keys(updateData)
        .map((key) => {
          if (key === 'assignedDriverId') {
            return assignedDriverName === '' ? 'assignedDriver: unassigned' : `assignedDriver: ${assignedDriverName}`;
          }
          return `${key}: ${JSON.stringify(updateData[key])}`;
        })
        .join(', ');

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: `Vehicle ${vehicle.unitNumber} updated: ${updatedFields}.`,
              vehicleUnit: vehicle.unitNumber,
              vehicleId: vehicle.vehicleId,
              updatedFields: updateData,
            }),
          },
        ],
      };
    } catch (error) {
      return errorResponse(`Failed to update vehicle ${vehicle.unitNumber}: ${error.message}`);
    }
  }

  @RequiresScope('fleet:write')
  @Tool({
    name: ToolNames.UPDATE_VEHICLE_STATUS,
    description:
      'Change a vehicle\'s operational status (available, in_shop, out_of_service) or perform lifecycle actions (deactivate, reactivate, decommission). Use when dispatcher says "put truck 101 in shop" or "deactivate truck T-200." Requires reason for deactivation and decommission. Do NOT use for editing fuel, plates, or VIN — use update-vehicle. Requires user confirmation before executing.',
    parameters: z.object({
      vehicleUnit: z.string().describe('Vehicle unit number, e.g. "T-101" or "101"'),
      action: z.enum(['deactivate', 'reactivate', 'decommission']).optional().describe('Lifecycle action to perform'),
      status: z
        .enum(['available', 'in_shop', 'out_of_service'])
        .optional()
        .describe('Operational status change (use instead of action for non-lifecycle changes)'),
      reason: z.string().optional().describe('Required for deactivation and decommission — reason for the action'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async updateVehicleStatus({
    vehicleUnit,
    action,
    status,
    reason,
    _tenantId,
    _userId,
  }: {
    vehicleUnit: string;
    action?: 'deactivate' | 'reactivate' | 'decommission';
    status?: 'available' | 'in_shop' | 'out_of_service';
    reason?: string;
    _tenantId?: number;
    _userId?: string;
  }) {
    if (!_tenantId) return errorResponse('Session error: no tenant context.');

    if (!action && !status) {
      return errorResponse(
        'Either an action (deactivate/reactivate/decommission) or a status (available/in_shop/out_of_service) must be provided.',
      );
    }

    // Handle operational status change (no lifecycle action)
    if (status && !action) {
      const vehicleResult = await this.resolver.resolveVehicle(vehicleUnit, _tenantId);
      if ('error' in vehicleResult) return errorResponse(vehicleResult.error);

      const vehicle = vehicleResult.data;
      const statusMap: Record<string, string> = {
        available: 'AVAILABLE',
        in_shop: 'IN_SHOP',
        out_of_service: 'OUT_OF_SERVICE',
      };

      try {
        await this.vehiclesService.update(vehicle.vehicleId, _tenantId, {
          status: statusMap[status],
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                message: `Vehicle ${vehicle.unitNumber} status updated to "${statusMap[status]}".`,
                vehicleUnit: vehicle.unitNumber,
                vehicleId: vehicle.vehicleId,
                status: statusMap[status],
              }),
            },
          ],
        };
      } catch (error) {
        return errorResponse(
          `Failed to update vehicle ${vehicle.unitNumber} status: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    if ((action === 'deactivate' || action === 'decommission') && !reason) {
      return errorResponse(
        `A reason is required when ${action === 'deactivate' ? 'deactivating' : 'decommissioning'} a vehicle.`,
      );
    }

    // Resolve user ID for audit trail
    let userId: number | undefined;
    if (_userId) {
      const user = await this.prisma.user.findFirst({
        where: { userId: _userId },
        select: { id: true },
      });
      if (user) userId = user.id;
    }
    if (!userId) {
      return errorResponse('Could not resolve current user for audit trail.');
    }

    // Resolve vehicle — use broader search for non-active vehicles too
    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        unitNumber: { contains: vehicleUnit, mode: 'insensitive' as const },
        tenantId: _tenantId,
      },
      take: 5,
    });

    if (vehicles.length === 0) {
      return errorResponse(`No vehicle found matching unit "${vehicleUnit}".`);
    }
    if (vehicles.length > 1) {
      return errorResponse(
        `Multiple vehicles match "${vehicleUnit}": ${vehicles.map((v) => v.unitNumber).join(', ')}. Please be more specific.`,
      );
    }

    const vehicle = vehicles[0];

    try {
      switch (action) {
        case 'deactivate':
          await this.vehiclesService.deactivate(vehicle.vehicleId, _tenantId, userId, reason);
          break;
        case 'reactivate':
          await this.vehiclesService.reactivate(vehicle.vehicleId, _tenantId, userId);
          break;
        case 'decommission':
          await this.vehiclesService.decommission(vehicle.vehicleId, _tenantId, userId, reason);
          break;
      }

      const actionVerb =
        action === 'deactivate' ? 'deactivated' : action === 'reactivate' ? 'reactivated' : 'decommissioned';

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: `Vehicle ${vehicle.unitNumber} has been ${actionVerb}.`,
              vehicleUnit: vehicle.unitNumber,
              vehicleId: vehicle.vehicleId,
              action: actionVerb,
              ...(reason && { reason }),
            }),
          },
        ],
      };
    } catch (error) {
      return errorResponse(`Failed to ${action} vehicle ${vehicle.unitNumber}: ${error.message}`);
    }
  }
}
