import { Controller, Get, Post, Put, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { BaseTenantController } from '../../../../shared/base/base-tenant.controller';
import { ExternalSourceGuard, ExternalSourceCheck } from '../../../../shared/guards/external-source.guard';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { VehiclesService } from '../services/vehicles.service';
import { CreateVehicleDto, UpdateVehicleDto, DeactivateVehicleDto } from '../dto';

/**
 * VehiclesController handles HTTP requests for vehicle management.
 * Extends BaseTenantController for tenant utilities.
 */
@ApiTags('Vehicles')
@ApiBearerAuth()
@Controller('vehicles')
export class VehiclesController extends BaseTenantController {
  constructor(
    prisma: PrismaService,
    private readonly vehiclesService: VehiclesService,
  ) {
    super(prisma);
  }

  @Get()
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'List all active vehicles' })
  async listVehicles(@CurrentUser() user: any, @Query('includeInactive') includeInactive?: string) {
    const tenantDbId = await this.getTenantDbId(user);
    const vehicles = await this.vehiclesService.findAll(tenantDbId, includeInactive === 'true');

    // Fetch upcoming vehicle unavailabilities (next 7 days)
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const upcomingUnavails = await this.prisma.vehicleUnavailability.findMany({
      where: {
        tenantId: tenantDbId,
        startDate: { lte: weekFromNow },
        endDate: { gte: now },
      },
      orderBy: { startDate: 'asc' },
    });
    const unavailByVehicle = new Map<number, { type: string; startDate: string; endDate: string }>();
    for (const u of upcomingUnavails) {
      if (!unavailByVehicle.has(u.vehicleId)) {
        unavailByVehicle.set(u.vehicleId, {
          type: u.type,
          startDate: u.startDate.toISOString().slice(0, 10),
          endDate: u.endDate.toISOString().slice(0, 10),
        });
      }
    }

    return vehicles.map((vehicle) => ({
      id: vehicle.id,
      vehicleId: vehicle.vehicleId,
      unitNumber: vehicle.unitNumber,
      vin: vehicle.vin,
      equipmentType: vehicle.equipmentType,
      status: vehicle.status,
      lifecycleStatus: vehicle.lifecycleStatus,
      previousStatus: vehicle.previousStatus,
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
      activeLoadCounts: {
        inTransit: (vehicle.loads ?? []).filter((l: any) => l.status === 'IN_TRANSIT').length,
        assigned: (vehicle.loads ?? []).filter((l: any) => l.status === 'ASSIGNED').length,
        onHold: (vehicle.loads ?? []).filter((l: any) => l.status === 'ON_HOLD').length,
      },
      externalVehicleId: vehicle.externalVehicleId,
      externalSource: vehicle.externalSource,
      lastSyncedAt: vehicle.lastSyncedAt?.toISOString(),
      deactivatedAt: vehicle.deactivatedAt?.toISOString() || null,
      deactivatedBy: vehicle.deactivatedBy || null,
      deactivationReason: vehicle.deactivationReason || null,
      reactivatedAt: vehicle.reactivatedAt?.toISOString() || null,
      reactivatedBy: vehicle.reactivatedBy || null,
      createdAt: vehicle.createdAt.toISOString(),
      updatedAt: vehicle.updatedAt.toISOString(),
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
      upcomingUnavailability: unavailByVehicle.get(vehicle.id) ?? null,
    }));
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Create a new vehicle' })
  async createVehicle(@CurrentUser() user: any, @Body() createVehicleDto: CreateVehicleDto) {
    const tenantDbId = await this.getTenantDbId(user);

    const vehicle = await this.vehiclesService.create(tenantDbId, {
      unitNumber: createVehicleDto.unitNumber,
      vin: createVehicleDto.vin,
      equipmentType: createVehicleDto.equipmentType,
      fuelCapacityGallons: createVehicleDto.fuelCapacityGallons,
      mpg: createVehicleDto.mpg,
      status: createVehicleDto.status,
      make: createVehicleDto.make,
      model: createVehicleDto.model,
      year: createVehicleDto.year,
      licensePlate: createVehicleDto.licensePlate,
      licensePlateState: createVehicleDto.licensePlateState,
      hasSleeperBerth: createVehicleDto.hasSleeperBerth,
      grossWeightLbs: createVehicleDto.grossWeightLbs,
      currentFuelGallons: createVehicleDto.currentFuelGallons,
      assignedDriverId: createVehicleDto.assignedDriverId,
    });

    return {
      id: vehicle.id,
      vehicleId: vehicle.vehicleId,
      unitNumber: vehicle.unitNumber,
      vin: vehicle.vin,
      equipmentType: vehicle.equipmentType,
      status: vehicle.status,
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
      externalVehicleId: vehicle.externalVehicleId,
      externalSource: vehicle.externalSource,
      lastSyncedAt: vehicle.lastSyncedAt?.toISOString(),
      createdAt: vehicle.createdAt.toISOString(),
      updatedAt: vehicle.updatedAt.toISOString(),
    };
  }

  @Put(':vehicle_id')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.DISPATCHER)
  @ApiOperation({ summary: 'Update vehicle' })
  @ApiParam({ name: 'vehicle_id', description: 'Vehicle ID' })
  async updateVehicle(
    @CurrentUser() user: any,
    @Param('vehicle_id') vehicleId: string,
    @Body() updateVehicleDto: UpdateVehicleDto,
  ) {
    const tenantDbId = await this.getTenantDbId(user);

    const vehicle = await this.vehiclesService.update(vehicleId, tenantDbId, {
      unitNumber: updateVehicleDto.unitNumber,
      vin: updateVehicleDto.vin,
      equipmentType: updateVehicleDto.equipmentType,
      fuelCapacityGallons: updateVehicleDto.fuelCapacityGallons,
      mpg: updateVehicleDto.mpg,
      status: updateVehicleDto.status,
      make: updateVehicleDto.make,
      model: updateVehicleDto.model,
      year: updateVehicleDto.year,
      licensePlate: updateVehicleDto.licensePlate,
      licensePlateState: updateVehicleDto.licensePlateState,
      hasSleeperBerth: updateVehicleDto.hasSleeperBerth,
      grossWeightLbs: updateVehicleDto.grossWeightLbs,
      currentFuelGallons: updateVehicleDto.currentFuelGallons,
      assignedDriverId: updateVehicleDto.assignedDriverId,
    });

    return {
      id: vehicle.id,
      vehicleId: vehicle.vehicleId,
      unitNumber: vehicle.unitNumber,
      vin: vehicle.vin,
      equipmentType: vehicle.equipmentType,
      status: vehicle.status,
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
      externalVehicleId: vehicle.externalVehicleId,
      externalSource: vehicle.externalSource,
      lastSyncedAt: vehicle.lastSyncedAt?.toISOString(),
      createdAt: vehicle.createdAt.toISOString(),
      updatedAt: vehicle.updatedAt.toISOString(),
    };
  }

  @Get('inactive/list')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'List all inactive and decommissioned vehicles' })
  async getInactiveVehicles(@CurrentUser() user: any) {
    const tenantDbId = await this.getTenantDbId(user);
    const vehicles = await this.vehiclesService.findAll(tenantDbId, true);
    return vehicles
      .filter((v: any) => v.lifecycleStatus !== 'ACTIVE')
      .map((vehicle: any) => this.vehiclesService.formatResponse(vehicle));
  }

  @Get(':vehicle_id')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get vehicle by ID' })
  @ApiParam({ name: 'vehicle_id', description: 'Vehicle ID' })
  async getVehicle(@Param('vehicle_id') vehicleId: string, @CurrentUser() user: any) {
    const tenantDbId = await this.getTenantDbId(user);
    const vehicle = await this.vehiclesService.findOne(vehicleId, tenantDbId);
    return this.vehiclesService.formatResponse(vehicle);
  }

  @Post(':vehicle_id/deactivate')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @UseGuards(ExternalSourceGuard)
  @ExternalSourceCheck('vehicle')
  @ApiOperation({ summary: 'Deactivate a vehicle' })
  @ApiParam({ name: 'vehicle_id', description: 'Vehicle ID' })
  async deactivate(
    @Param('vehicle_id') vehicleId: string,
    @Body() dto: DeactivateVehicleDto,
    @CurrentUser() user: any,
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.vehiclesService.deactivate(vehicleId, tenantDbId, user.dbId, dto.reason);
  }

  @Post(':vehicle_id/reactivate')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Reactivate an inactive vehicle' })
  @ApiParam({ name: 'vehicle_id', description: 'Vehicle ID' })
  async reactivate(@Param('vehicle_id') vehicleId: string, @CurrentUser() user: any) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.vehiclesService.reactivate(vehicleId, tenantDbId, user.dbId);
  }

  @Post(':vehicle_id/decommission')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @UseGuards(ExternalSourceGuard)
  @ExternalSourceCheck('vehicle')
  @ApiOperation({ summary: 'Decommission a vehicle (permanent)' })
  @ApiParam({ name: 'vehicle_id', description: 'Vehicle ID' })
  async decommission(
    @Param('vehicle_id') vehicleId: string,
    @Body() dto: DeactivateVehicleDto,
    @CurrentUser() user: any,
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.vehiclesService.decommission(vehicleId, tenantDbId, user.dbId, dto.reason);
  }
}
