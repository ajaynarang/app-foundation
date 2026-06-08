import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  UseGuards,
  Inject,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { BaseTenantController } from '../../../../shared/base/base-tenant.controller';
import { ExternalSourceGuard, ExternalSourceCheck } from '../../../../shared/guards/external-source.guard';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { IntegrationDataService } from '../../../integrations/services/integration-data.service';
import { DriversActivationService } from '../services/drivers-activation.service';
import { DispatchBoardService } from '../services/dispatch-board.service';
import { DriversService } from '../services/drivers.service';
import { CreateDriverDto, UpdateDriverDto, DeactivateDriverDto } from '../dto';
import { sortActiveLoads } from '../utils/sort-active-loads';

/**
 * DriversController handles HTTP requests for driver management.
 * Extends BaseTenantController for tenant utilities.
 */
@ApiTags('Drivers')
@ApiBearerAuth()
@Controller('drivers')
export class DriversController extends BaseTenantController {
  constructor(
    prisma: PrismaService,
    private readonly driversService: DriversService,
    @Inject(IntegrationDataService)
    private readonly integrationManager: IntegrationDataService,
    private readonly driversActivationService: DriversActivationService,
    private readonly dispatchBoardService: DispatchBoardService,
  ) {
    super(prisma);
  }

  @Get()
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({
    summary: 'List all active drivers with SALLY access status',
  })
  async listDrivers(@CurrentUser() user: any, @Query('includeInactive') includeInactive?: string) {
    const tenantDbId = await this.getTenantDbId(user);
    const drivers = await this.driversService.findAll(tenantDbId, includeInactive === 'true');

    // Fetch upcoming unavailabilities (next 7 days) for all drivers
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const upcomingUnavails = await this.prisma.driverUnavailability.findMany({
      where: {
        tenantId: tenantDbId,
        startDate: { lte: weekFromNow },
        endDate: { gte: now },
      },
      orderBy: { startDate: 'asc' },
    });
    const unavailByDriver = new Map<number, { type: string; startDate: string; endDate: string }>();
    for (const u of upcomingUnavails) {
      if (!unavailByDriver.has(u.driverId)) {
        unavailByDriver.set(u.driverId, {
          type: u.type,
          startDate: u.startDate.toISOString().slice(0, 10),
          endDate: u.endDate.toISOString().slice(0, 10),
        });
      }
    }

    return drivers.map((driver) => {
      // Derive SALLY access status
      let sallyAccessStatus: 'ACTIVE' | 'INVITED' | 'NO_ACCESS' | 'DEACTIVATED' = 'NO_ACCESS';
      let linkedUserId: string | null = null;
      let pendingInvitationId: string | null = null;

      if (driver.user) {
        linkedUserId = driver.user.userId;
        sallyAccessStatus = driver.user.isActive ? 'ACTIVE' : 'DEACTIVATED';
      } else if (driver.invitations?.length > 0) {
        sallyAccessStatus = 'INVITED';
        pendingInvitationId = driver.invitations[0].invitationId;
      }

      return {
        id: driver.id,
        driverId: driver.driverId,
        name: driver.name,
        licenseNumber: driver.licenseNumber,
        licenseState: driver.licenseState,
        cdlClass: driver.cdlClass,
        endorsements: driver.endorsements,
        phone: driver.phone,
        email: driver.email,
        status: driver.status,
        currentHoursDriven: driver.currentHoursDriven,
        currentOnDutyTime: driver.currentOnDutyTime,
        currentHoursSinceBreak: driver.currentHoursSinceBreak,
        cycleHoursUsed: driver.cycleHoursUsed,
        currentHos: driver.hosData
          ? {
              driveRemaining: (driver.hosData.driveTimeRemainingMs ?? 0) / 3600000,
              shiftRemaining: (driver.hosData.shiftTimeRemainingMs ?? 0) / 3600000,
              cycleRemaining: (driver.hosData.cycleTimeRemainingMs ?? 0) / 3600000,
              breakRemaining: Math.max(0, (driver.hosData.timeUntilBreakMs ?? 0) / 3600000),
              breakRequired: (driver.hosData.timeUntilBreakMs ?? 0) / 3600000 < 0.5,
              dataSource: driver.hosData.data_source ?? driver.hosDataSource,
              lastUpdated: driver.hosDataSyncedAt?.toISOString(),
            }
          : null,
        hosDataSource: driver.hosDataSource,
        hosDataSyncedAt: driver.hosDataSyncedAt?.toISOString(),
        eldMetadata: driver.eldMetadata,
        externalDriverId: driver.externalDriverId,
        externalSource: driver.externalSource,
        lastSyncedAt: driver.lastSyncedAt?.toISOString(),
        assignedVehicleId: driver.assignedVehicleId,
        assignedVehicle: driver.assignedVehicle
          ? {
              id: driver.assignedVehicle.id,
              vehicleId: driver.assignedVehicle.vehicleId,
              unitNumber: driver.assignedVehicle.unitNumber,
              make: driver.assignedVehicle.make,
              model: driver.assignedVehicle.model,
            }
          : null,
        activeLoadCounts: {
          inTransit: (driver.loads ?? []).filter((l: any) => l.status === 'IN_TRANSIT').length,
          assigned: (driver.loads ?? []).filter((l: any) => l.status === 'ASSIGNED').length,
          onHold: (driver.loads ?? []).filter((l: any) => l.status === 'ON_HOLD').length,
        },
        createdAt: driver.createdAt.toISOString(),
        updatedAt: driver.updatedAt.toISOString(),
        sallyAccessStatus: sallyAccessStatus,
        linkedUserId: linkedUserId,
        pendingInvitationId: pendingInvitationId,
        upcomingUnavailability: unavailByDriver.get(driver.id) ?? null,
      };
    });
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Create a new driver (basic info only)' })
  async createDriver(@CurrentUser() user: any, @Body() createDriverDto: CreateDriverDto) {
    if (!createDriverDto.phone && !createDriverDto.email) {
      throw new BadRequestException('At least one of phone or email is required');
    }

    const tenantDbId = await this.getTenantDbId(user);

    const driver = await this.driversService.create(tenantDbId, {
      name: createDriverDto.name,
      phone: createDriverDto.phone,
      email: createDriverDto.email,
      cdlClass: createDriverDto.cdlClass,
      licenseNumber: createDriverDto.licenseNumber,
      licenseState: createDriverDto.licenseState,
      endorsements: createDriverDto.endorsements,
      hireDate: createDriverDto.hireDate,
      medicalCardExpiry: createDriverDto.medicalCardExpiry,
      homeTerminalCity: createDriverDto.homeTerminalCity,
      homeTerminalState: createDriverDto.homeTerminalState,
      emergencyContactName: createDriverDto.emergencyContactName,
      emergencyContactPhone: createDriverDto.emergencyContactPhone,
      notes: createDriverDto.notes,
      assignedVehicleId: createDriverDto.assignedVehicleId,
    });

    return {
      id: driver.id,
      driverId: driver.driverId,
      name: driver.name,
      phone: driver.phone,
      email: driver.email,
      cdlClass: driver.cdlClass,
      licenseNumber: driver.licenseNumber,
      licenseState: driver.licenseState,
      createdAt: driver.createdAt,
      updatedAt: driver.updatedAt,
    };
  }

  @Put(':driver_id')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  // SQ-105: ExternalSourceGuard was a blanket 403 — replaced by service-level
  // field-level split (drivers.service.update) so dispatchers can edit
  // operational fields on ELD-synced drivers while identity stays managed.
  @ApiOperation({ summary: 'Update driver basic info' })
  @ApiParam({ name: 'driver_id', description: 'Driver ID' })
  async updateDriver(
    @CurrentUser() user: any,
    @Param('driver_id') driverId: string,
    @Body() updateDriverDto: UpdateDriverDto,
  ) {
    const tenantDbId = await this.getTenantDbId(user);

    const driver = await this.driversService.update(driverId, tenantDbId, {
      name: updateDriverDto.name,
      phone: updateDriverDto.phone,
      email: updateDriverDto.email,
      cdlClass: updateDriverDto.cdlClass,
      licenseNumber: updateDriverDto.licenseNumber,
      licenseState: updateDriverDto.licenseState,
      endorsements: updateDriverDto.endorsements,
      hireDate: updateDriverDto.hireDate,
      medicalCardExpiry: updateDriverDto.medicalCardExpiry,
      homeTerminalCity: updateDriverDto.homeTerminalCity,
      homeTerminalState: updateDriverDto.homeTerminalState,
      emergencyContactName: updateDriverDto.emergencyContactName,
      emergencyContactPhone: updateDriverDto.emergencyContactPhone,
      notes: updateDriverDto.notes,
      assignedVehicleId: updateDriverDto.assignedVehicleId,
    });

    return {
      id: driver.id,
      driverId: driver.driverId,
      name: driver.name,
      phone: driver.phone,
      email: driver.email,
      cdlClass: driver.cdlClass,
      licenseNumber: driver.licenseNumber,
      licenseState: driver.licenseState,
      endorsements: driver.endorsements,
      hireDate: driver.hireDate ? driver.hireDate.toISOString().split('T')[0] : null,
      medicalCardExpiry: driver.medicalCardExpiry ? driver.medicalCardExpiry.toISOString().split('T')[0] : null,
      homeTerminalCity: driver.homeTerminalCity,
      homeTerminalState: driver.homeTerminalState,
      emergencyContactName: driver.emergencyContactName,
      emergencyContactPhone: driver.emergencyContactPhone,
      notes: driver.notes,
      updatedAt: driver.updatedAt,
    };
  }

  @Get('dispatch-board')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get driver dispatch board view' })
  @ApiQuery({
    name: 'filter',
    required: false,
    enum: ['all', 'available', 'onLoad', 'hosCritical'],
  })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['name', 'hosRemaining', 'status'],
  })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  async getDispatchBoard(
    @CurrentUser() user: any,
    @Query('filter') filter?: 'all' | 'available' | 'onLoad' | 'hosCritical',
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: 'name' | 'hosRemaining' | 'status',
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.dispatchBoardService.getDispatchBoard(tenantDbId, {
      filter,
      search,
      sortBy,
      sortOrder,
    });
  }

  @Get('pending/list')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get all pending drivers awaiting activation' })
  async getPendingDrivers(@CurrentUser() user: any) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.driversActivationService.getPendingDrivers(tenantDbId);
  }

  @Get('inactive/list')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get all inactive drivers' })
  async getInactiveDrivers(@CurrentUser() user: any) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.driversActivationService.getInactiveDrivers(tenantDbId);
  }

  @Get(':driver_id/weekly-stats')
  @Roles(UserRole.DRIVER, UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get weekly stats for a driver' })
  @ApiParam({ name: 'driver_id', description: 'Driver ID' })
  async getWeeklyStats(@Param('driver_id') driverId: string, @CurrentUser() user: any) {
    const tenantDbId = await this.getTenantDbId(user);
    this.assertDriverOwnership(user, driverId, tenantDbId);
    return this.driversService.getWeeklyStats(driverId, tenantDbId);
  }

  @Get(':driver_id')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER, UserRole.DRIVER)
  @ApiOperation({ summary: 'Get driver by ID' })
  @ApiParam({ name: 'driver_id', description: 'Driver ID' })
  @ApiResponse({
    status: 200,
    description: 'Driver details',
  })
  @ApiResponse({ status: 404, description: 'Driver not found' })
  async getDriver(@Param('driver_id') driverId: string, @CurrentUser() user: any) {
    const tenantDbId = await this.getTenantDbId(user);
    this.assertDriverOwnership(user, driverId, tenantDbId);
    const driver = await this.driversService.findOne(driverId, tenantDbId);

    // Derive SALLY access status
    let sallyAccessStatus: string = 'NO_ACCESS';
    let linkedUserId: string | null = null;
    let pendingInvitationId: string | null = null;

    if (driver.user) {
      linkedUserId = driver.user.userId;
      sallyAccessStatus = driver.user.isActive ? 'ACTIVE' : 'DEACTIVATED';
    } else if (driver.invitations?.length > 0) {
      sallyAccessStatus = 'INVITED';
      pendingInvitationId = driver.invitations[0].invitationId;
    }

    return {
      id: driver.id,
      driverId: driver.driverId,
      name: driver.name,
      phone: driver.phone,
      email: driver.email,
      cdlClass: driver.cdlClass,
      licenseNumber: driver.licenseNumber,
      licenseState: driver.licenseState,
      endorsements: driver.endorsements,
      status: driver.status,
      hireDate: driver.hireDate ? driver.hireDate.toISOString().split('T')[0] : null,
      medicalCardExpiry: driver.medicalCardExpiry ? driver.medicalCardExpiry.toISOString().split('T')[0] : null,
      homeTerminalCity: driver.homeTerminalCity,
      homeTerminalState: driver.homeTerminalState,
      homeTerminalTimezone: driver.homeTerminalTimezone,
      emergencyContactName: driver.emergencyContactName,
      emergencyContactPhone: driver.emergencyContactPhone,
      notes: driver.notes,
      // External sync
      externalDriverId: driver.externalDriverId,
      externalSource: driver.externalSource,
      syncStatus: driver.syncStatus,
      lastSyncedAt: driver.lastSyncedAt?.toISOString(),
      // HOS
      currentHoursDriven: driver.currentHoursDriven,
      currentOnDutyTime: driver.currentOnDutyTime,
      currentHoursSinceBreak: driver.currentHoursSinceBreak,
      cycleHoursUsed: driver.cycleHoursUsed,
      // ELD
      eldMetadata: driver.eldMetadata,
      hosData: driver.hosData,
      // Assignment
      assignedVehicleId: driver.assignedVehicleId,
      assignedVehicle: driver.assignedVehicle
        ? {
            id: driver.assignedVehicle.id,
            vehicleId: driver.assignedVehicle.vehicleId,
            unitNumber: driver.assignedVehicle.unitNumber,
            make: driver.assignedVehicle.make,
            model: driver.assignedVehicle.model,
          }
        : null,
      // Relations — priority: in_transit first, then assigned by createdAt
      ...this.formatActiveLoads(driver.loads ?? []),
      sallyAccessStatus: sallyAccessStatus,
      linkedUserId: linkedUserId,
      pendingInvitationId: pendingInvitationId,
      createdAt: driver.createdAt.toISOString(),
      updatedAt: driver.updatedAt.toISOString(),
    };
  }

  @Get(':driverId/hos')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER, UserRole.DRIVER)
  @ApiOperation({
    summary: 'Get live HOS data for driver from integration (with cache fallback)',
  })
  @ApiParam({ name: 'driverId', description: 'Driver ID' })
  async getDriverHOS(@Param('driverId') driverId: string, @CurrentUser() user: any) {
    const tenantDbId = await this.getTenantDbId(user);
    this.assertDriverOwnership(user, driverId, tenantDbId);

    const tenant = await this.getTenant(user.tenantId);
    const hosData = await this.integrationManager.getDriverHOS(tenant.id, driverId);

    return hosData ?? null;
  }

  @Post(':driver_id/activate')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Activate a pending driver' })
  @ApiParam({ name: 'driver_id', description: 'Driver ID' })
  async activateDriver(@Param('driver_id') driverId: string, @CurrentUser() user: any) {
    const tenant = await this.getTenant(user.tenantId);

    return this.driversActivationService.activateDriver(driverId, {
      id: user.dbId,
      tenant: { id: tenant.id },
    });
  }

  @Post(':driver_id/deactivate')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @UseGuards(ExternalSourceGuard)
  @ExternalSourceCheck('driver')
  @ApiOperation({ summary: 'Deactivate an active driver' })
  @ApiParam({ name: 'driver_id', description: 'Driver ID' })
  async deactivateDriver(
    @Param('driver_id') driverId: string,
    @CurrentUser() user: any,
    @Body() dto: DeactivateDriverDto,
  ) {
    const tenant = await this.getTenant(user.tenantId);

    return this.driversActivationService.deactivateDriver(
      driverId,
      {
        id: user.dbId,
        tenant: { id: tenant.id },
      },
      dto.reason,
    );
  }

  @Post(':driver_id/reactivate')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Reactivate an inactive driver' })
  @ApiParam({ name: 'driver_id', description: 'Driver ID' })
  async reactivateDriver(@Param('driver_id') driverId: string, @CurrentUser() user: any) {
    const tenant = await this.getTenant(user.tenantId);

    return this.driversActivationService.reactivateDriver(driverId, {
      id: user.dbId,
      tenant: { id: tenant.id },
    });
  }

  @Post(':driver_id/activate-and-invite')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({
    summary: 'Activate a driver and send SALLY invitation in one step',
  })
  @ApiParam({ name: 'driver_id', description: 'Driver ID' })
  async activateAndInvite(
    @Param('driver_id') driverId: string,
    @CurrentUser() user: any,
    @Body('email') email?: string,
    @Body('phone') phone?: string,
  ) {
    const tenant = await this.getTenant(user.tenantId);

    return this.driversActivationService.activateAndInvite(
      driverId,
      email,
      {
        ...user,
        tenant: { id: tenant.id },
      },
      phone,
    );
  }

  /**
   * Verify that a DRIVER-role user owns the requested driver record.
   * Non-DRIVER roles pass through without checks.
   */
  private assertDriverOwnership(user: any, driverId: string, _tenantDbId: number) {
    if (user.role !== 'DRIVER') return;

    // user.driverId is the string driver ID (e.g. "DRV-MLZJMPRE") from the JWT payload
    if (!user.driverId || user.driverId !== driverId) {
      throw new NotFoundException('Driver not found');
    }
  }

  private formatActiveLoads(loads: any[]) {
    const sorted = sortActiveLoads(loads);
    const current = sorted[0] ?? null;
    const upcoming = sorted.slice(1);
    const format = (l: any) => ({
      loadId: l.loadId,
      loadNumber: l.loadNumber,
      referenceNumber: l.referenceNumber,
      status: l.status,
      customerName: l.customerName,
      originCity: l.originCity,
      originState: l.originState,
      destinationCity: l.destinationCity,
      destinationState: l.destinationState,
      // Trip grouping (null when the load isn't part of a multi-load trip).
      // `tripId` here is the human TRIP-… string, matching the Load API shape.
      tripId: l.trip?.tripId ?? null,
      tripOrder: l.tripOrder ?? null,
    });
    return {
      currentLoad: current ? format(current) : null,
      upcomingLoads: upcoming.map(format),
    };
  }
}
