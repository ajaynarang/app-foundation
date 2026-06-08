import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { EntityResolver, errorResponse } from '../utils/entity-resolver';
import { DriversService } from '../../../../fleet/drivers/services/drivers.service';
import { RequiresScope } from '../../../agent-contract/requires-scope.decorator';
import { ToolNames } from '../../../agent-contract/tool-names.constants';

/**
 * Driver Management Action MCP Tools — mutation tools for driver field updates and status changes.
 *
 * All queries are tenant-scoped via `_tenantId`, which is injected by
 * McpToolService from the authenticated session — NEVER from AI input.
 * The AI cannot see or override the _tenantId parameter.
 */
@Injectable()
export class DriverMgmtActionTool {
  private readonly resolver: EntityResolver;

  constructor(
    private readonly prisma: PrismaService,
    private readonly driversService: DriversService,
  ) {
    this.resolver = new EntityResolver(prisma);
  }

  @RequiresScope('fleet:write')
  @Tool({
    name: ToolNames.UPDATE_DRIVER,
    description:
      'Update a driver\'s contact info, notes, assigned vehicle, or medical card expiry. Use for edits like "update John\'s phone to 555-1234" or "set Smith\'s medical card expiry to 2027-06-15." Do NOT use to activate/deactivate — use update-driver-status. Requires user confirmation before executing.',
    parameters: z.object({
      driverName: z.string().describe('Driver name or partial name, e.g. "John Smith" or "Smith"'),
      phone: z.string().optional().describe('New phone number'),
      email: z.string().optional().describe('New email address'),
      notes: z.string().optional().describe('Notes about the driver'),
      assignedVehicleUnit: z.string().optional().describe('Unit number of vehicle to assign, e.g. "T-101"'),
      medicalCardExpiry: z.string().optional().describe('ISO date string, e.g. 2027-06-15'),
      emergencyContactName: z.string().optional().describe('Emergency contact name'),
      emergencyContactPhone: z.string().optional().describe('Emergency contact phone'),
      customFieldValues: z
        .record(z.string(), z.union([z.string(), z.number()]))
        .optional()
        .describe(
          'Custom field values as key-value pairs. Use get-custom-field-definitions to discover available fields.',
        ),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
    }),
  })
  async updateDriverFields({
    driverName,
    phone,
    email,
    notes,
    assignedVehicleUnit,
    medicalCardExpiry,
    emergencyContactName,
    emergencyContactPhone,
    customFieldValues,
    _tenantId,
  }: {
    driverName: string;
    phone?: string;
    email?: string;
    notes?: string;
    assignedVehicleUnit?: string;
    medicalCardExpiry?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    customFieldValues?: Record<string, string | number>;
    _tenantId?: number;
  }) {
    if (!_tenantId) return errorResponse('Session error: no tenant context.');

    const driverResult = await this.resolver.resolveDriver(driverName, _tenantId);
    if ('error' in driverResult) return errorResponse(driverResult.error);

    const driver = driverResult.data;

    // Resolve vehicle if assignedVehicleUnit is provided
    let assignedVehicleId: number | undefined;
    if (assignedVehicleUnit) {
      const vehicleResult = await this.resolver.resolveVehicle(assignedVehicleUnit, _tenantId);
      if ('error' in vehicleResult) return errorResponse(vehicleResult.error);
      assignedVehicleId = vehicleResult.data.id;
    }

    // Build update data — only include fields that were provided
    const updateData: Record<string, unknown> = {};
    if (phone !== undefined) updateData.phone = phone;
    if (email !== undefined) updateData.email = email;
    if (notes !== undefined) updateData.notes = notes;
    if (assignedVehicleId !== undefined) updateData.assignedVehicleId = assignedVehicleId;
    if (medicalCardExpiry !== undefined) updateData.medicalCardExpiry = medicalCardExpiry;
    if (emergencyContactName !== undefined) updateData.emergencyContactName = emergencyContactName;
    if (emergencyContactPhone !== undefined) updateData.emergencyContactPhone = emergencyContactPhone;
    if (customFieldValues !== undefined) updateData.customFieldValues = customFieldValues;

    if (Object.keys(updateData).length === 0) {
      return errorResponse('No fields provided to update.');
    }

    try {
      await this.driversService.update(driver.driverId, _tenantId, updateData);

      const updatedFields = Object.keys(updateData)
        .map((key) => {
          if (key === 'assignedVehicleId') return `assignedVehicle: ${assignedVehicleUnit}`;
          return `${key}: ${JSON.stringify(updateData[key])}`;
        })
        .join(', ');

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: `Driver ${driver.name} updated: ${updatedFields}.`,
              driverName: driver.name,
              driverId: driver.driverId,
              updatedFields: updateData,
            }),
          },
        ],
      };
    } catch (error) {
      return errorResponse(`Failed to update driver ${driver.name}: ${error.message}`);
    }
  }

  @RequiresScope('fleet:write:sensitive')
  @Tool({
    name: ToolNames.UPDATE_DRIVER_STATUS,
    description:
      'Activate, deactivate, or reactivate a driver. Use when dispatcher says "deactivate driver John." Requires reason for deactivation. Do NOT use for editing contact info, notes, or assigned vehicle — use update-driver. Requires user confirmation before executing.',
    parameters: z.object({
      driverName: z.string().describe('Driver name or partial name, e.g. "John Smith" or "Smith"'),
      action: z.enum(['activate', 'deactivate', 'reactivate']).describe('Status action to perform'),
      reason: z.string().optional().describe('Required for deactivation — reason for deactivating'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async updateDriverStatus({
    driverName,
    action,
    reason,
    _tenantId,
    _userId,
  }: {
    driverName: string;
    action: 'activate' | 'deactivate' | 'reactivate';
    reason?: string;
    _tenantId?: number;
    _userId?: string;
  }) {
    if (!_tenantId) return errorResponse('Session error: no tenant context.');

    if (action === 'deactivate' && !reason) {
      return errorResponse('A reason is required when deactivating a driver.');
    }

    const driverResult = await this.resolver.resolveDriver(driverName, _tenantId);
    if ('error' in driverResult) return errorResponse(driverResult.error);

    const driver = driverResult.data;

    // Validate current status allows the requested transition
    if (action === 'deactivate' && driver.status === 'INACTIVE') {
      return errorResponse(`Driver ${driver.name} is already inactive.`);
    }
    if ((action === 'activate' || action === 'reactivate') && driver.status === 'ACTIVE') {
      return errorResponse(`Driver ${driver.name} is already active.`);
    }

    const newStatus = action === 'deactivate' ? 'INACTIVE' : 'ACTIVE';

    try {
      // Append deactivation note to existing notes instead of overwriting
      const existingNotes = driver.notes || '';
      const deactivationNote = `\n[Deactivated ${new Date().toISOString().split('T')[0]}]: ${reason}`;

      await this.prisma.driver.update({
        where: { id: driver.id },
        data: {
          status: newStatus,
          ...(action === 'deactivate' && reason ? { notes: existingNotes + deactivationNote } : {}),
        },
      });

      const actionVerb =
        action === 'deactivate' ? 'deactivated' : action === 'reactivate' ? 'reactivated' : 'activated';

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: `Driver ${driver.name} has been ${actionVerb}.`,
              driverName: driver.name,
              driverId: driver.driverId,
              newStatus,
              ...(reason && { reason }),
            }),
          },
        ],
      };
    } catch (error) {
      return errorResponse(`Failed to ${action} driver ${driver.name}: ${error.message}`);
    }
  }
}
