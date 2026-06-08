import { Injectable, Logger, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';
import { Vehicle } from '@prisma/client';
import { generateId } from '../../../../shared/utils/id-generator';
import { addUtcDays, startOfUtcToday, toUtcCalendarDate } from '../../../../shared/utils/calendar-date';
import { CustomFieldValidatorService } from '../../custom-fields/custom-field-validator.service';

/**
 * VehiclesService handles all vehicle-related business logic.
 * Extracted from VehiclesController to separate concerns.
 */
@Injectable()
export class VehiclesService {
  private readonly logger = new Logger(VehiclesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly customFieldValidator: CustomFieldValidatorService,
    private readonly events: DomainEventService,
  ) {}

  /**
   * Find all vehicles for a tenant, including telematics data.
   * By default excludes INACTIVE/DECOMMISSIONED vehicles; pass includeInactive=true to include all.
   */
  async findAll(tenantId: number, includeInactive: boolean = false) {
    const where: any = { tenantId };
    if (!includeInactive) {
      where.lifecycleStatus = 'ACTIVE';
    }

    return this.prisma.vehicle.findMany({
      where,
      include: {
        telematics: true,
        assignedDriver: {
          select: { id: true, driverId: true, name: true },
        },
        loads: {
          where: {
            status: { in: ['ASSIGNED', 'IN_TRANSIT', 'ON_HOLD'] },
            isActive: true,
          },
          select: { status: true },
        },
      },
      orderBy: { vehicleId: 'asc' },
    });
  }

  /**
   * Find one vehicle by ID
   */
  async findOne(vehicleId: string, tenantId: number): Promise<Vehicle> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: {
        vehicleId_tenantId: {
          vehicleId,
          tenantId,
        },
      },
      include: {
        telematics: true,
        assignedDriver: {
          select: { id: true, driverId: true, name: true },
        },
      },
    });

    if (!vehicle) {
      throw new NotFoundException(`Vehicle not found: ${vehicleId}`);
    }

    return vehicle;
  }

  /**
   * Create a new vehicle (auto-generates vehicleId).
   * After creation, performs a soft fleet-limit check without blocking vehicle creation.
   */
  async create(
    tenantId: number,
    data: {
      unitNumber: string;
      vin: string;
      equipmentType: string;
      fuelCapacityGallons: number;
      mpg?: number;
      status?: string;
      make?: string;
      model?: string;
      year?: number;
      licensePlate?: string;
      licensePlateState?: string;
      hasSleeperBerth?: boolean;
      grossWeightLbs?: number;
      currentFuelGallons?: number;
      assignedDriverId?: number | null;
      customFieldValues?: Record<string, unknown>;
    },
  ): Promise<Vehicle> {
    const vehicleId = `VEH-${Date.now().toString(36).toUpperCase()}`;

    const { values: customFieldValues } = await this.customFieldValidator.validate(
      tenantId,
      'VEHICLE',
      data.customFieldValues,
      { isCreate: true },
    );

    try {
      const vehicle = await this.prisma.$transaction(async (tx) => {
        const created = await tx.vehicle.create({
          data: {
            vehicleId,
            unitNumber: data.unitNumber,
            vin: data.vin,
            equipmentType: data.equipmentType as any,
            fuelCapacityGallons: data.fuelCapacityGallons,
            mpg: data.mpg,
            status: (data.status as any) || 'AVAILABLE',
            make: data.make || null,
            model: data.model || null,
            year: data.year || null,
            licensePlate: data.licensePlate || null,
            licensePlateState: data.licensePlateState || null,
            hasSleeperBerth: data.hasSleeperBerth ?? true,
            grossWeightLbs: data.grossWeightLbs || null,
            currentFuelGallons: data.currentFuelGallons,
            ...(data.assignedDriverId !== undefined ? { assignedDriverId: data.assignedDriverId } : {}),
            customFieldValues: customFieldValues as any,
            tenantId,
          },
        });

        // Bidirectional sync: set driver's assignedVehicleId
        if (data.assignedDriverId) {
          await tx.driver.update({
            where: { id: data.assignedDriverId },
            data: { assignedVehicleId: created.id },
          });
        }

        return created;
      });

      this.logger.log(`Vehicle created: ${vehicleId} - ${data.unitNumber}`);

      // Soft fleet-limit check: never throws, never blocks vehicle creation
      this.checkFleetLimitSoft(tenantId, vehicle.id).catch((err) => {
        this.logger.warn(`Fleet limit soft check failed (non-blocking): ${err?.message}`);
      });

      await this.events.emit(SALLY_EVENTS.VEHICLE_CREATED, tenantId, {
        entityId: vehicle.vehicleId,
        entityType: 'vehicle',
        vehicleNumber: vehicle.vehicleId,
        unitNumber: vehicle.unitNumber,
      });

      return vehicle;
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException('Vehicle with this VIN or ID already exists');
      }
      throw error;
    }
  }

  /**
   * Async soft fleet-limit check.
   * If the tenant's active vehicle count exceeds the plan's fleet limit,
   * sets fleetLimitWarning=true and creates a system alert.
   * This method NEVER throws — failures are logged silently.
   */
  private async checkFleetLimitSoft(tenantId: number, newVehicleDbId: number): Promise<void> {
    try {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, tenantId: true, plan: true },
      });

      if (!tenant) return;

      const planConfig = await this.prisma.planConfig.findUnique({
        where: { plan: tenant.plan },
        select: { fleetLimit: true, displayName: true },
      });

      // No fleet limit for this plan (e.g. ENTERPRISE)
      if (!planConfig || planConfig.fleetLimit === null || planConfig.fleetLimit === undefined) return;

      const vehicleCount = await this.prisma.vehicle.count({
        where: { tenantId, lifecycleStatus: 'ACTIVE' },
      });

      if (vehicleCount > planConfig.fleetLimit) {
        this.logger.warn(
          `Tenant ${tenant.tenantId} has ${vehicleCount} vehicles, exceeding plan limit of ${planConfig.fleetLimit}`,
        );

        // Set fleet limit warning flag on tenant
        await this.prisma.tenant.update({
          where: { id: tenantId },
          data: { fleetLimitWarning: true },
        });

        // Create system alert. driverId stays NULL (Phase 2 Task 10) — this
        // is a system-emitted alert with no associated driver. The old
        // placeholder string 'system' was a workaround for the previous
        // NOT NULL constraint on driver_id.
        await this.prisma.alert.create({
          data: {
            alertId: generateId('alert'),
            tenantId,
            vehicleId: newVehicleDbId,
            alertType: 'FLEET_LIMIT_EXCEEDED',
            category: 'system',
            priority: 'HIGH',
            title: 'Fleet Limit Exceeded',
            message: `Your fleet now has ${vehicleCount} active vehicles, which exceeds the ${planConfig.displayName} plan limit of ${planConfig.fleetLimit}. Please upgrade your plan to continue adding vehicles without restrictions.`,
            recommendedAction: 'Contact sales to upgrade your pricing plan.',
          },
        });
      }
    } catch (err) {
      // Intentionally swallow errors — this check must never block vehicle creation
      this.logger.warn(`Fleet limit check encountered an error: ${err?.message}`);
    }
  }

  /**
   * Update vehicle info.
   * For TMS-synced vehicles (externalSource is set), identity fields are stripped
   * so dispatchers can only update operational fields (status, equipment, fuel, etc.).
   */
  async update(
    vehicleId: string,
    tenantId: number,
    data: {
      unitNumber?: string;
      vin?: string;
      equipmentType?: string;
      fuelCapacityGallons?: number;
      mpg?: number;
      status?: string;
      make?: string;
      model?: string;
      year?: number;
      licensePlate?: string;
      licensePlateState?: string;
      hasSleeperBerth?: boolean;
      grossWeightLbs?: number;
      currentFuelGallons?: number;
      assignedDriverId?: number | null;
      customFieldValues?: Record<string, unknown>;
    },
  ): Promise<Vehicle> {
    // Check if vehicle exists and whether it's TMS-synced
    const existing = await this.prisma.vehicle.findUnique({
      where: { vehicleId_tenantId: { vehicleId, tenantId } },
      select: {
        id: true,
        externalSource: true,
        assignedDriverId: true,
        customFieldValues: true,
      },
    });

    if (!existing) {
      throw new NotFoundException(`Vehicle not found: ${vehicleId}`);
    }

    // For TMS-synced vehicles, destructure out identity fields (only operational fields pass through)
    let filteredData = data;
    if (existing.externalSource) {
      const { unitNumber, vin, make, model, year, licensePlate, licensePlateState, ...operationalFields } = data;
      filteredData = operationalFields;

      const attemptedTmsFields = [unitNumber, vin, make, model, year, licensePlate, licensePlateState]
        .map((v, i) =>
          v !== undefined
            ? ['unitNumber', 'vin', 'make', 'model', 'year', 'licensePlate', 'licensePlateState'][i]
            : null,
        )
        .filter(Boolean);

      if (attemptedTmsFields.length > 0) {
        this.logger.log(
          `Vehicle ${vehicleId} is TMS-synced (${existing.externalSource}). ` +
            `Filtered TMS-owned fields: ${attemptedTmsFields.join(', ')}`,
        );
      }
    }

    let validatedCustomFields: Record<string, string | number | null> | undefined;
    if (data.customFieldValues !== undefined) {
      const { values } = await this.customFieldValidator.validate(tenantId, 'VEHICLE', data.customFieldValues, {
        existingValues: existing.customFieldValues as any,
      });
      validatedCustomFields = values;
    }

    try {
      const vehicle = await this.prisma.$transaction(async (tx) => {
        // Bidirectional sync for primary driver assignment
        if (data.assignedDriverId !== undefined) {
          // Clear old driver's assignedVehicleId
          if (existing.assignedDriverId && existing.assignedDriverId !== data.assignedDriverId) {
            await tx.driver.update({
              where: { id: existing.assignedDriverId },
              data: { assignedVehicleId: null },
            });
          }
          // Set new driver's assignedVehicleId
          if (data.assignedDriverId) {
            await tx.driver.update({
              where: { id: data.assignedDriverId },
              data: { assignedVehicleId: existing.id },
            });
          }
        }

        return tx.vehicle.update({
          where: { vehicleId_tenantId: { vehicleId, tenantId } },
          data: {
            // Operational fields (always allowed)
            ...(filteredData.equipmentType !== undefined ? { equipmentType: filteredData.equipmentType as any } : {}),
            ...(filteredData.fuelCapacityGallons !== undefined
              ? { fuelCapacityGallons: filteredData.fuelCapacityGallons }
              : {}),
            ...(filteredData.mpg !== undefined ? { mpg: filteredData.mpg } : {}),
            ...(filteredData.status !== undefined ? { status: filteredData.status as any } : {}),
            ...(filteredData.hasSleeperBerth !== undefined ? { hasSleeperBerth: filteredData.hasSleeperBerth } : {}),
            ...(filteredData.grossWeightLbs !== undefined ? { grossWeightLbs: filteredData.grossWeightLbs } : {}),
            ...(filteredData.currentFuelGallons !== undefined
              ? { currentFuelGallons: filteredData.currentFuelGallons }
              : {}),
            // Identity fields (only for manual vehicles — defensive double-check)
            ...(!existing.externalSource && filteredData.unitNumber !== undefined
              ? { unitNumber: filteredData.unitNumber }
              : {}),
            ...(!existing.externalSource && filteredData.vin !== undefined ? { vin: filteredData.vin } : {}),
            ...(!existing.externalSource && filteredData.make !== undefined ? { make: filteredData.make } : {}),
            ...(!existing.externalSource && filteredData.model !== undefined ? { model: filteredData.model } : {}),
            ...(!existing.externalSource && filteredData.year !== undefined ? { year: filteredData.year } : {}),
            ...(!existing.externalSource && filteredData.licensePlate !== undefined
              ? { licensePlate: filteredData.licensePlate }
              : {}),
            ...(!existing.externalSource && filteredData.licensePlateState !== undefined
              ? { licensePlateState: filteredData.licensePlateState }
              : {}),
            ...(filteredData.assignedDriverId !== undefined ? { assignedDriverId: filteredData.assignedDriverId } : {}),
            ...(validatedCustomFields !== undefined ? { customFieldValues: validatedCustomFields as any } : {}),
          },
        });
      });

      this.logger.log(`Vehicle updated: ${vehicleId}`);

      await this.events.emit(SALLY_EVENTS.VEHICLE_UPDATED, tenantId, {
        entityId: vehicle.vehicleId,
        entityType: 'vehicle',
        vehicleNumber: vehicle.vehicleId,
        changedFields: Object.keys(data),
      });

      return vehicle;
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException('Vehicle with this VIN already exists');
      }
      throw error;
    }
  }

  /**
   * Check for active loads and route plans that would block a lifecycle change.
   * Throws ConflictException if any are found.
   */
  private async checkSafetyForLifecycleChange(vehicleId: number) {
    const activeLoads = await this.prisma.load.findMany({
      where: {
        vehicleId,
        status: { in: ['ASSIGNED', 'IN_TRANSIT', 'ON_HOLD'] },
        isActive: true,
      },
      select: { loadNumber: true, status: true },
    });

    if (activeLoads.length > 0) {
      throw new ConflictException({
        message: `Cannot perform this action. Vehicle has ${activeLoads.length} active load(s) that must be completed or reassigned first.`,
        activeLoads: activeLoads.map((l) => ({
          loadNumber: l.loadNumber,
          status: l.status,
        })),
      });
    }

    const activeRoutePlans = await this.prisma.routePlan.findMany({
      where: {
        vehicleId,
        isActive: true,
        status: 'ACTIVE',
      },
      select: { planId: true },
    });

    if (activeRoutePlans.length > 0) {
      throw new ConflictException({
        message: `Cannot perform this action. Vehicle has ${activeRoutePlans.length} active route plan(s).`,
        activeRoutePlans: activeRoutePlans.map((rp) => rp.planId),
      });
    }
  }

  /**
   * Deactivate a vehicle (sets lifecycleStatus to INACTIVE).
   * Blocks if vehicle has active loads or route plans.
   */
  async deactivate(vehicleId: string, tenantId: number, userId: number, reason: string) {
    const vehicle = await this.findOne(vehicleId, tenantId);
    if (vehicle.lifecycleStatus !== 'ACTIVE') {
      throw new BadRequestException('Vehicle is not active');
    }

    await this.checkSafetyForLifecycleChange(vehicle.id);

    const updated = await this.prisma.vehicle.update({
      where: { id: vehicle.id },
      data: {
        lifecycleStatus: 'INACTIVE',
        previousStatus: vehicle.status,
        deactivatedAt: new Date(),
        deactivatedBy: userId,
        deactivationReason: reason,
      },
    });

    this.logger.log(`Vehicle deactivated: ${vehicleId}`);

    await this.events.emit(SALLY_EVENTS.VEHICLE_DEACTIVATED, tenantId, {
      entityId: vehicleId,
      entityType: 'vehicle',
      vehicleNumber: vehicleId,
      reason,
    });

    return this.formatResponse(updated);
  }

  /**
   * Reactivate an inactive vehicle (sets lifecycleStatus to ACTIVE).
   * Restores the previous operational status.
   */
  async reactivate(vehicleId: string, tenantId: number, userId: number) {
    const vehicle = await this.findOne(vehicleId, tenantId);
    if (vehicle.lifecycleStatus !== 'INACTIVE') {
      throw new BadRequestException('Vehicle is not inactive');
    }

    const updated = await this.prisma.vehicle.update({
      where: { id: vehicle.id },
      data: {
        lifecycleStatus: 'ACTIVE',
        status: vehicle.previousStatus || 'AVAILABLE',
        previousStatus: null,
        reactivatedAt: new Date(),
        reactivatedBy: userId,
        deactivatedAt: null,
        deactivatedBy: null,
        deactivationReason: null,
      },
    });

    this.logger.log(`Vehicle reactivated: ${vehicleId}`);
    return this.formatResponse(updated);
  }

  /**
   * Decommission a vehicle (permanent lifecycle end).
   * Blocks if vehicle has active loads or route plans.
   */
  async decommission(vehicleId: string, tenantId: number, userId: number, reason: string) {
    const vehicle = await this.findOne(vehicleId, tenantId);
    if (vehicle.lifecycleStatus === 'DECOMMISSIONED') {
      throw new BadRequestException('Vehicle is already decommissioned');
    }

    await this.checkSafetyForLifecycleChange(vehicle.id);

    const updated = await this.prisma.vehicle.update({
      where: { id: vehicle.id },
      data: {
        lifecycleStatus: 'DECOMMISSIONED',
        previousStatus: vehicle.status,
        deactivatedAt: new Date(),
        deactivatedBy: userId,
        deactivationReason: reason,
      },
    });

    this.logger.log(`Vehicle decommissioned: ${vehicleId}`);
    return this.formatResponse(updated);
  }

  /**
   * Schedule a preventive-maintenance appointment by setting
   * `Vehicle.nextMaintenanceDate`. Narrow method used by the Desk
   * `schedule-preventive-maintenance` MCP tool — appends the optional note
   * to the `notes` text column (we have no dedicated PM notes surface yet).
   *
   * Tenant-scoped via the composite key lookup.
   */
  async scheduleMaintenance(tenantId: number, vehicleId: string, scheduledDate: Date, note?: string): Promise<Vehicle> {
    const existing = await this.prisma.vehicle.findUnique({
      where: { vehicleId_tenantId: { vehicleId, tenantId } },
      select: { id: true, notes: true },
    });

    if (!existing) {
      throw new NotFoundException(`Vehicle not found: ${vehicleId}`);
    }

    // Append the note so we retain context of why/when maintenance was
    // scheduled; we prefix with the ISO date so it sorts naturally.
    const mergedNotes =
      note && note.trim().length > 0
        ? `${existing.notes ? existing.notes + '\n' : ''}[PM ${toUtcCalendarDate(scheduledDate)}] ${note.trim()}`
        : existing.notes;

    const updated = await this.prisma.vehicle.update({
      where: { id: existing.id },
      data: {
        nextMaintenanceDate: scheduledDate,
        ...(mergedNotes !== existing.notes ? { notes: mergedNotes } : {}),
      },
    });

    this.logger.log(`Vehicle ${vehicleId} PM scheduled for ${toUtcCalendarDate(scheduledDate)}`);

    await this.events.emit(SALLY_EVENTS.VEHICLE_MAINTENANCE_SCHEDULED, tenantId, {
      entityId: updated.vehicleId,
      entityType: 'vehicle',
      vehicleNumber: updated.vehicleId,
      scheduledDate: toUtcCalendarDate(scheduledDate),
      note: note ?? null,
    });

    return updated;
  }

  /**
   * Format vehicle data for API response
   */
  formatResponse(vehicle: any) {
    return {
      id: vehicle.id,
      vehicleId: vehicle.vehicleId,
      unitNumber: vehicle.unitNumber,
      vin: vehicle.vin,
      equipmentType: vehicle.equipmentType,
      status: vehicle.status,
      lifecycleStatus: vehicle.lifecycleStatus,
      previousStatus: vehicle.previousStatus || null,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      licensePlate: vehicle.licensePlate,
      licensePlateState: vehicle.licensePlateState,
      hasSleeperBerth: vehicle.hasSleeperBerth,
      grossWeightLbs: vehicle.grossWeightLbs,
      fuelCapacityGallons: vehicle.fuelCapacityGallons,
      currentFuelGallons: vehicle.currentFuelGallons,
      mpg: vehicle.mpg,
      eldTelematicsMetadata: vehicle.eldTelematicsMetadata,
      assignedDriverId: vehicle.assignedDriverId,
      assignedDriver: vehicle.assignedDriver
        ? {
            id: vehicle.assignedDriver.id,
            driverId: vehicle.assignedDriver.driverId,
            name: vehicle.assignedDriver.name,
          }
        : null,
      telematics: vehicle.telematics
        ? {
            latitude: vehicle.telematics.latitude,
            longitude: vehicle.telematics.longitude,
            speed: vehicle.telematics.speed,
            heading: vehicle.telematics.heading,
            fuelLevel: vehicle.telematics.fuelLevel,
            engineRunning: vehicle.telematics.engineRunning,
            odometer: vehicle.telematics.odometer,
            timestamp: vehicle.telematics.timestamp?.toISOString(),
            updatedAt: vehicle.telematics.updatedAt?.toISOString(),
          }
        : null,
      externalVehicleId: vehicle.externalVehicleId,
      externalSource: vehicle.externalSource,
      lastSyncedAt: vehicle.lastSyncedAt?.toISOString() || null,
      deactivatedAt: vehicle.deactivatedAt?.toISOString() || null,
      deactivatedBy: vehicle.deactivatedBy || null,
      deactivationReason: vehicle.deactivationReason || null,
      reactivatedAt: vehicle.reactivatedAt?.toISOString() || null,
      reactivatedBy: vehicle.reactivatedBy || null,
      createdAt: vehicle.createdAt?.toISOString(),
      updatedAt: vehicle.updatedAt?.toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Desk fan-out queries
  //
  // Narrow read queries used by Sally's Desk to find entities that a
  // responsibility should act on today. Also consumed by the corresponding
  // MCP tools (`get-vehicles-due-for-pm`, `get-vehicles-with-expiring-inspections`)
  // so the Prisma query is defined in one place. Returns the raw rows —
  // MCP tools format for the model, fan-out adapters map to {type, id}.
  // ---------------------------------------------------------------------------

  /**
   * Active vehicles whose next preventive-maintenance date falls within the
   * window. Deterministic order (nearest date first) so truncation drops
   * the least-urgent rows.
   */
  async findPMDue(
    tenantId: number,
    options: { withinDays: number; limit?: number } = { withinDays: 7 },
  ): Promise<VehicleDueForPmRow[]> {
    const windowEnd = addUtcDays(startOfUtcToday(), options.withinDays);
    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        tenantId,
        lifecycleStatus: 'ACTIVE',
        nextMaintenanceDate: { lte: windowEnd, not: null },
      },
      select: {
        vehicleId: true,
        unitNumber: true,
        make: true,
        model: true,
        year: true,
        nextMaintenanceDate: true,
        assignedDriver: { select: { driverId: true, name: true } },
      },
      orderBy: { nextMaintenanceDate: 'asc' },
      take: options.limit ?? 200,
    });
    return vehicles
      .filter((v): v is typeof v & { nextMaintenanceDate: Date } => v.nextMaintenanceDate !== null)
      .map((v) => ({
        vehicleId: v.vehicleId,
        unitNumber: v.unitNumber,
        make: v.make,
        model: v.model,
        year: v.year,
        nextMaintenanceDate: toUtcCalendarDate(v.nextMaintenanceDate),
        assignedDriverId: v.assignedDriver?.driverId ?? null,
        assignedDriverName: v.assignedDriver?.name ?? null,
      }));
  }

  /**
   * Active vehicles whose DOT annual inspection date falls within the window.
   * Shape matches `findPMDue` but keyed off `annualInspectionDate`.
   */
  async findInspectionDue(
    tenantId: number,
    options: { withinDays: number; limit?: number } = { withinDays: 14 },
  ): Promise<VehicleInspectionDueRow[]> {
    const windowEnd = addUtcDays(startOfUtcToday(), options.withinDays);
    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        tenantId,
        lifecycleStatus: 'ACTIVE',
        annualInspectionDate: { lte: windowEnd, not: null },
      },
      select: {
        vehicleId: true,
        unitNumber: true,
        make: true,
        model: true,
        year: true,
        annualInspectionDate: true,
        assignedDriver: { select: { driverId: true, name: true } },
      },
      orderBy: { annualInspectionDate: 'asc' },
      take: options.limit ?? 200,
    });
    return vehicles
      .filter((v): v is typeof v & { annualInspectionDate: Date } => v.annualInspectionDate !== null)
      .map((v) => ({
        vehicleId: v.vehicleId,
        unitNumber: v.unitNumber,
        make: v.make,
        model: v.model,
        year: v.year,
        annualInspectionDate: toUtcCalendarDate(v.annualInspectionDate),
        assignedDriverId: v.assignedDriver?.driverId ?? null,
        assignedDriverName: v.assignedDriver?.name ?? null,
      }));
  }

  /**
   * Vehicles with any of registration / insurance / annual inspection
   * expiring within the window. Returns one row per (vehicle, documentType)
   * pair so the caller can decide per-document what to do.
   */
  async findDocsExpiringSoon(
    tenantId: number,
    options: { withinDays: number; limit?: number } = { withinDays: 14 },
  ): Promise<VehicleExpiringDocRow[]> {
    const windowEnd = addUtcDays(startOfUtcToday(), options.withinDays);
    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        tenantId,
        lifecycleStatus: 'ACTIVE',
        OR: [
          { registrationExpiry: { lte: windowEnd, not: null } },
          { insuranceExpiry: { lte: windowEnd, not: null } },
          { annualInspectionDate: { lte: windowEnd, not: null } },
        ],
      },
      select: {
        vehicleId: true,
        unitNumber: true,
        registrationExpiry: true,
        insuranceExpiry: true,
        annualInspectionDate: true,
      },
      orderBy: [{ registrationExpiry: 'asc' }, { insuranceExpiry: 'asc' }, { annualInspectionDate: 'asc' }],
      take: options.limit ?? 200,
    });
    const rows: VehicleExpiringDocRow[] = [];
    for (const v of vehicles) {
      if (v.registrationExpiry && v.registrationExpiry <= windowEnd) {
        rows.push({
          vehicleId: v.vehicleId,
          unitNumber: v.unitNumber,
          documentType: 'registration',
          expiresOn: toUtcCalendarDate(v.registrationExpiry),
        });
      }
      if (v.insuranceExpiry && v.insuranceExpiry <= windowEnd) {
        rows.push({
          vehicleId: v.vehicleId,
          unitNumber: v.unitNumber,
          documentType: 'insurance',
          expiresOn: toUtcCalendarDate(v.insuranceExpiry),
        });
      }
      if (v.annualInspectionDate && v.annualInspectionDate <= windowEnd) {
        rows.push({
          vehicleId: v.vehicleId,
          unitNumber: v.unitNumber,
          documentType: 'annual_inspection',
          expiresOn: toUtcCalendarDate(v.annualInspectionDate),
        });
      }
    }
    rows.sort((a, b) => a.expiresOn.localeCompare(b.expiresOn));
    return rows;
  }
}

/** Row shape returned by `VehiclesService.findPMDue` — used by both the MCP tool and Desk fanOut. */
export interface VehicleDueForPmRow {
  vehicleId: string;
  unitNumber: string;
  make: string | null;
  model: string | null;
  year: number | null;
  nextMaintenanceDate: string;
  assignedDriverId: string | null;
  assignedDriverName: string | null;
}

/** Row shape returned by `VehiclesService.findInspectionDue`. */
export interface VehicleInspectionDueRow {
  vehicleId: string;
  unitNumber: string;
  make: string | null;
  model: string | null;
  year: number | null;
  annualInspectionDate: string;
  assignedDriverId: string | null;
  assignedDriverName: string | null;
}

/** Row shape returned by `VehiclesService.findDocsExpiringSoon`. */
export interface VehicleExpiringDocRow {
  vehicleId: string;
  unitNumber: string;
  documentType: 'registration' | 'insurance' | 'annual_inspection';
  expiresOn: string;
}
