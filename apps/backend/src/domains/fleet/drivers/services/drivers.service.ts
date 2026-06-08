import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { CustomFieldValidatorService } from '../../custom-fields/custom-field-validator.service';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';
import { Driver } from '@prisma/client';
import { addUtcDays, startOfUtcToday, toUtcCalendarDate } from '../../../../shared/utils/calendar-date';

/**
 * DriversService handles all driver-related business logic.
 * Extracted from DriversController to separate concerns.
 */
@Injectable()
export class DriversService {
  private readonly logger = new Logger(DriversService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly customFieldValidator: CustomFieldValidatorService,
    private readonly events: DomainEventService,
  ) {}

  /**
   * Find all drivers for a tenant, including SALLY access status.
   * By default excludes INACTIVE drivers; pass includeInactive=true to include all.
   */
  async findAll(tenantId: number, includeInactive: boolean = false): Promise<any[]> {
    const where: any = { tenantId };
    if (!includeInactive) {
      where.status = { in: ['PENDING_ACTIVATION', 'ACTIVE'] };
    }

    return this.prisma.driver.findMany({
      where,
      include: {
        user: {
          select: {
            userId: true,
            isActive: true,
          },
        },
        invitations: {
          where: { status: 'PENDING' },
          select: {
            invitationId: true,
            status: true,
          },
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
        assignedVehicle: {
          select: {
            id: true,
            vehicleId: true,
            unitNumber: true,
            make: true,
            model: true,
          },
        },
        loads: {
          where: {
            status: { in: ['ASSIGNED', 'IN_TRANSIT', 'ON_HOLD'] },
            isActive: true,
          },
          select: { status: true },
        },
      },
      orderBy: { driverId: 'asc' },
    });
  }

  /**
   * Find one driver by ID
   */
  async findOne(driverId: string, tenantId: number): Promise<any> {
    const driver = await this.prisma.driver.findUnique({
      where: {
        driverId_tenantId: {
          driverId,
          tenantId,
        },
      },
      include: {
        user: {
          select: {
            userId: true,
            isActive: true,
          },
        },
        loads: {
          where: {
            status: { in: ['ASSIGNED', 'IN_TRANSIT'] },
            isActive: true,
          },
          select: {
            loadNumber: true,
            referenceNumber: true,
            status: true,
            customerName: true,
            originCity: true,
            originState: true,
            destinationCity: true,
            destinationState: true,
            pickupDate: true,
            assignedAt: true,
            createdAt: true,
            // Trip grouping — lets the driver app show a multi-load trip as one
            // ordered sequence instead of disconnected loads.
            tripId: true,
            tripOrder: true,
            trip: { select: { tripId: true } },
          },
          orderBy: { createdAt: 'asc' },
          take: 10,
        },
        invitations: {
          where: { status: 'PENDING' },
          select: {
            invitationId: true,
            status: true,
          },
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
        assignedVehicle: {
          select: {
            id: true,
            vehicleId: true,
            unitNumber: true,
            make: true,
            model: true,
          },
        },
      },
    });

    if (!driver) {
      throw new NotFoundException(`Driver not found: ${driverId}`);
    }

    return driver;
  }

  /**
   * Create a new driver (manual entry, immediately active)
   */
  async create(
    tenantId: number,
    data: {
      name: string;
      phone?: string;
      email?: string;
      cdlClass: string;
      licenseNumber: string;
      licenseState?: string;
      endorsements?: string[];
      hireDate?: string;
      medicalCardExpiry?: string;
      homeTerminalCity?: string;
      homeTerminalState?: string;
      emergencyContactName?: string;
      emergencyContactPhone?: string;
      notes?: string;
      assignedVehicleId?: number | null;
      customFieldValues?: Record<string, unknown>;
    },
  ): Promise<Driver> {
    const driverId = `DRV-${Date.now().toString(36).toUpperCase()}`;

    const { values: validatedCustomFields } = await this.customFieldValidator.validate(
      tenantId,
      'DRIVER',
      data.customFieldValues,
      { isCreate: true },
    );

    try {
      const driver = await this.prisma.$transaction(async (tx) => {
        const created = await tx.driver.create({
          data: {
            driverId,
            name: data.name,
            phone: data.phone || null,
            email: data.email || null,
            cdlClass: data.cdlClass as any,
            licenseNumber: data.licenseNumber,
            licenseState: data.licenseState || null,
            status: 'ACTIVE',
            tenantId,
            syncStatus: 'MANUAL_ENTRY',
            ...(data.endorsements !== undefined ? { endorsements: data.endorsements } : {}),
            ...(data.hireDate !== undefined ? { hireDate: data.hireDate ? new Date(data.hireDate) : null } : {}),
            ...(data.medicalCardExpiry !== undefined
              ? {
                  medicalCardExpiry: data.medicalCardExpiry ? new Date(data.medicalCardExpiry) : null,
                }
              : {}),
            ...(data.homeTerminalCity !== undefined ? { homeTerminalCity: data.homeTerminalCity } : {}),
            ...(data.homeTerminalState !== undefined ? { homeTerminalState: data.homeTerminalState } : {}),
            ...(data.emergencyContactName !== undefined ? { emergencyContactName: data.emergencyContactName } : {}),
            ...(data.emergencyContactPhone !== undefined ? { emergencyContactPhone: data.emergencyContactPhone } : {}),
            ...(data.notes !== undefined ? { notes: data.notes } : {}),
            ...(data.assignedVehicleId !== undefined ? { assignedVehicleId: data.assignedVehicleId } : {}),
            customFieldValues: validatedCustomFields,
          },
        });

        // Bidirectional sync: set vehicle's assignedDriverId
        if (data.assignedVehicleId) {
          await tx.vehicle.update({
            where: { id: data.assignedVehicleId },
            data: { assignedDriverId: created.id },
          });
        }

        return created;
      });

      this.logger.log(`Driver created: ${driverId} - ${data.name}`);

      await this.events.emit(SALLY_EVENTS.DRIVER_CREATED, tenantId, {
        entityId: driver.driverId,
        entityType: 'driver',
        driverNumber: driver.driverId,
        name: data.name,
      });

      return driver;
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException('Driver ID already exists');
      }
      throw error;
    }
  }

  /**
   * Update driver info
   */
  async update(
    driverId: string,
    tenantId: number,
    data: {
      name?: string;
      phone?: string;
      email?: string;
      cdlClass?: string;
      licenseNumber?: string;
      licenseState?: string;
      endorsements?: string[];
      hireDate?: string;
      medicalCardExpiry?: string;
      homeTerminalCity?: string;
      homeTerminalState?: string;
      emergencyContactName?: string;
      emergencyContactPhone?: string;
      notes?: string;
      assignedVehicleId?: number | null;
      customFieldValues?: Record<string, unknown>;
    },
  ): Promise<Driver> {
    const driver = await this.prisma.$transaction(async (tx) => {
      // Bidirectional sync for primary vehicle assignment + fetch existing custom fields
      const existingDriver = await tx.driver.findUnique({
        where: { driverId_tenantId: { driverId, tenantId } },
        select: { id: true, assignedVehicleId: true, customFieldValues: true, externalSource: true },
      });

      const { values: validatedCustomFields } = await this.customFieldValidator.validate(
        tenantId,
        'DRIVER',
        data.customFieldValues,
        {
          existingValues: existingDriver?.customFieldValues as Record<string, unknown> | null | undefined,
        },
      );

      // SQ-105 — Field-level split for ELD-synced drivers.
      // Mirrors vehicles.service:276-296: when externalSource is set, identity
      // fields are managed by the ELD (Samsara) and must not be overwritten;
      // operational fields (notes, homeTerminal*, emergencyContact*, hireDate,
      // medicalCardExpiry, endorsements, assignedVehicleId) remain editable
      // by the dispatcher. Prior behavior was a blanket 403 via
      // ExternalSourceGuard, which broke even valid operational edits — the
      // exact symptom QA reported as SQ-105.
      const isSynced = !!existingDriver?.externalSource;
      if (isSynced) {
        const droppedIdentityFields = (
          ['name', 'phone', 'email', 'cdlClass', 'licenseNumber', 'licenseState'] as const
        ).filter((k) => data[k] !== undefined);
        if (droppedIdentityFields.length > 0) {
          this.logger.log(
            `Driver ${driverId} is ELD-synced (${existingDriver?.externalSource}). ` +
              `Filtered ELD-owned fields: ${droppedIdentityFields.join(', ')}`,
          );
        }
      }

      if (data.assignedVehicleId !== undefined && existingDriver) {
        // Clear old vehicle's assignedDriverId
        if (existingDriver.assignedVehicleId && existingDriver.assignedVehicleId !== data.assignedVehicleId) {
          await tx.vehicle.update({
            where: { id: existingDriver.assignedVehicleId },
            data: { assignedDriverId: null },
          });
        }
        // Set new vehicle's assignedDriverId
        if (data.assignedVehicleId) {
          await tx.vehicle.update({
            where: { id: data.assignedVehicleId },
            data: { assignedDriverId: existingDriver.id },
          });
        }
      }

      return tx.driver.update({
        where: {
          driverId_tenantId: {
            driverId,
            tenantId,
          },
        },
        data: {
          // Identity fields — only writable on manual (non-ELD-synced) drivers.
          ...(!isSynced && data.name !== undefined ? { name: data.name } : {}),
          ...(!isSynced && data.phone !== undefined ? { phone: data.phone } : {}),
          ...(!isSynced && data.email !== undefined ? { email: data.email } : {}),
          ...(!isSynced && data.cdlClass !== undefined ? { cdlClass: data.cdlClass as any } : {}),
          ...(!isSynced && data.licenseNumber !== undefined ? { licenseNumber: data.licenseNumber } : {}),
          ...(!isSynced && data.licenseState !== undefined ? { licenseState: data.licenseState } : {}),
          // Operational fields — always writable, regardless of sync source.
          ...(data.endorsements !== undefined ? { endorsements: data.endorsements } : {}),
          ...(data.hireDate !== undefined ? { hireDate: data.hireDate ? new Date(data.hireDate) : null } : {}),
          ...(data.medicalCardExpiry !== undefined
            ? {
                medicalCardExpiry: data.medicalCardExpiry ? new Date(data.medicalCardExpiry) : null,
              }
            : {}),
          ...(data.homeTerminalCity !== undefined ? { homeTerminalCity: data.homeTerminalCity } : {}),
          ...(data.homeTerminalState !== undefined ? { homeTerminalState: data.homeTerminalState } : {}),
          ...(data.emergencyContactName !== undefined ? { emergencyContactName: data.emergencyContactName } : {}),
          ...(data.emergencyContactPhone !== undefined ? { emergencyContactPhone: data.emergencyContactPhone } : {}),
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
          ...(data.assignedVehicleId !== undefined ? { assignedVehicleId: data.assignedVehicleId } : {}),
          ...(data.customFieldValues !== undefined ? { customFieldValues: validatedCustomFields } : {}),
        },
      });
    });

    this.logger.log(`Driver updated: ${driverId}`);

    await this.events.emit(SALLY_EVENTS.DRIVER_UPDATED, tenantId, {
      entityId: driver.driverId,
      entityType: 'driver',
      driverNumber: driver.driverId,
      changedFields: Object.keys(data),
    });

    return driver;
  }

  /**
   * Get weekly stats for a driver (current week, Monday-Sunday UTC).
   */
  async getWeeklyStats(
    driverId: string,
    tenantId: number,
  ): Promise<{
    loadsCompleted: number;
    milesDriven: number;
    earningsCents: number;
  }> {
    const driver = await this.prisma.driver.findUnique({
      where: { driverId_tenantId: { driverId, tenantId } },
      select: { id: true },
    });

    if (!driver) {
      throw new NotFoundException(`Driver not found: ${driverId}`);
    }

    // Monday 00:00 UTC of current week
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(now);
    monday.setUTCDate(now.getUTCDate() - daysSinceMonday);
    monday.setUTCHours(0, 0, 0, 0);

    const loads = await this.prisma.load.findMany({
      where: {
        driverId: driver.id,
        tenantId,
        deliveredAt: { gte: monday },
      },
      select: {
        actualMiles: true,
        estimatedMiles: true,
        settlementLineItems: {
          select: { payAmountCents: true },
        },
      },
    });

    const loadsCompleted = loads.length;
    const milesDriven = loads.reduce((sum, l) => sum + (l.actualMiles ?? l.estimatedMiles ?? 0), 0);
    const earningsCents = loads.reduce(
      (sum, l) => sum + l.settlementLineItems.reduce((liSum, li) => liSum + (li.payAmountCents ?? 0), 0),
      0,
    );

    return {
      loadsCompleted,
      milesDriven: Math.round(milesDriven),
      earningsCents,
    };
  }

  // ---------------------------------------------------------------------------
  // Desk fan-out queries
  //
  // Narrow read queries used by Sally's Desk to find drivers that a
  // responsibility should act on today. Also consumed by the corresponding
  // MCP tools (`get-drivers-returning-empty`, `get-expiring-documents`).
  // ---------------------------------------------------------------------------

  /**
   * Drivers whose most recent load DELIVERED within the window AND who have
   * no ASSIGNED/IN_TRANSIT load waiting. The "deadhead" surface for
   * `deadhead_optimization`. Implemented as two narrow Prisma queries joined
   * in-memory — keeps tenant scoping explicit and readable.
   */
  async findReturningEmpty(
    tenantId: number,
    options: { withinHours?: number; limit?: number } = {},
  ): Promise<DriverReturningEmptyRow[]> {
    const withinHours = options.withinHours ?? 24;
    const limit = options.limit ?? 50;
    const since = new Date(Date.now() - withinHours * 3_600_000);

    const deliveredLoads = await this.prisma.load.findMany({
      where: {
        tenantId,
        isActive: true,
        status: 'DELIVERED',
        deliveredAt: { gte: since },
        driverId: { not: null },
      },
      select: {
        id: true,
        loadNumber: true,
        driverId: true,
        deliveredAt: true,
        destinationCity: true,
        destinationState: true,
        driver: { select: { driverId: true, name: true } },
      },
      orderBy: [{ deliveredAt: 'desc' }, { id: 'desc' }],
      take: limit * 2, // wider net before we filter out drivers with follow-on work
    });

    if (deliveredLoads.length === 0) return [];

    // Keep only the most-recent delivered load per driver.
    const mostRecentByDriver = new Map<number, (typeof deliveredLoads)[0]>();
    for (const l of deliveredLoads) {
      if (l.driverId == null) continue;
      const existing = mostRecentByDriver.get(l.driverId);
      if (!existing || (l.deliveredAt?.getTime() ?? 0) > (existing.deliveredAt?.getTime() ?? 0)) {
        mostRecentByDriver.set(l.driverId, l);
      }
    }

    const driverDbIds = Array.from(mostRecentByDriver.keys());
    if (driverDbIds.length === 0) return [];

    const activeLoads = await this.prisma.load.findMany({
      where: {
        tenantId,
        isActive: true,
        status: { in: ['ASSIGNED', 'IN_TRANSIT'] },
        driverId: { in: driverDbIds },
      },
      select: { driverId: true },
    });
    const busyDrivers = new Set<number>(activeLoads.map((l) => l.driverId).filter((x): x is number => x !== null));
    const candidates = driverDbIds.filter((id) => !busyDrivers.has(id));

    type DeliveredLoad = (typeof deliveredLoads)[0];
    return candidates
      .map((id) => mostRecentByDriver.get(id))
      .filter((l): l is DeliveredLoad & { deliveredAt: Date } => !!l && l.deliveredAt !== null)
      .sort((a, b) => a.deliveredAt.getTime() - b.deliveredAt.getTime())
      .slice(0, limit)
      .map((l) => ({
        driverId: l.driver?.driverId ?? String(l.driverId),
        driverName: l.driver?.name ?? 'Unknown driver',
        lastDeliveredLoadNumber: l.loadNumber,
        deliveredAt: l.deliveredAt.toISOString(),
        deliveryStop: {
          city: l.destinationCity,
          state: l.destinationState,
        },
      }));
  }

  /**
   * Active drivers with any of CDL or medical card expiring within the
   * window. Returns one row per (driver, documentType) pair so the caller
   * can decide per-document what to do.
   */
  async findDocsExpiringSoon(
    tenantId: number,
    options: { withinDays: number; limit?: number } = { withinDays: 14 },
  ): Promise<DriverExpiringDocRow[]> {
    const windowEnd = addUtcDays(startOfUtcToday(), options.withinDays);

    const drivers = await this.prisma.driver.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        OR: [{ medicalCardExpiry: { lte: windowEnd, not: null } }, { cdlExpiry: { lte: windowEnd, not: null } }],
      },
      select: {
        driverId: true,
        name: true,
        cdlExpiry: true,
        medicalCardExpiry: true,
      },
      orderBy: [{ cdlExpiry: 'asc' }, { medicalCardExpiry: 'asc' }],
      take: options.limit ?? 200,
    });

    const rows: DriverExpiringDocRow[] = [];
    for (const d of drivers) {
      if (d.cdlExpiry && d.cdlExpiry <= windowEnd) {
        rows.push({
          driverId: d.driverId,
          driverName: d.name,
          documentType: 'cdl',
          expiresOn: toUtcCalendarDate(d.cdlExpiry),
        });
      }
      if (d.medicalCardExpiry && d.medicalCardExpiry <= windowEnd) {
        rows.push({
          driverId: d.driverId,
          driverName: d.name,
          documentType: 'medical',
          expiresOn: toUtcCalendarDate(d.medicalCardExpiry),
        });
      }
    }
    rows.sort((a, b) => a.expiresOn.localeCompare(b.expiresOn));
    return rows;
  }
}

/** Row shape for `DriversService.findReturningEmpty`. */
export interface DriverReturningEmptyRow {
  driverId: string;
  driverName: string;
  lastDeliveredLoadNumber: string;
  deliveredAt: string;
  deliveryStop: {
    city: string | null;
    state: string | null;
  };
}

/** Row shape for `DriversService.findDocsExpiringSoon`. */
export interface DriverExpiringDocRow {
  driverId: string;
  driverName: string;
  documentType: 'cdl' | 'medical';
  expiresOn: string;
}
