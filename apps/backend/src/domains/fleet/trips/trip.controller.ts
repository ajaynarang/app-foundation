import { Controller, Post, Get, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { BaseTenantController } from '../../../shared/base/base-tenant.controller';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { TripService } from './trip.service';
import { CreateTripDto, AssignTripDto, UpdateTripDto, AddLoadToTripDto, TripListQueryDto } from './dto';

@ApiTags('Trips')
@ApiBearerAuth()
@Controller('trips')
export class TripController extends BaseTenantController {
  constructor(
    prisma: PrismaService,
    private readonly tripService: TripService,
  ) {
    super(prisma);
  }

  @Post()
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Create a trip from multiple loads' })
  async create(@CurrentUser() user: any, @Body() dto: CreateTripDto) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.tripService.create(tenantDbId, dto, user.dbId);
  }

  @Get()
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'List trips with filters and pagination' })
  async list(@CurrentUser() user: any, @Query() query: TripListQueryDto) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.tripService.findAll(tenantDbId, query);
  }

  @Get(':trip_id')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get trip detail with loads' })
  @ApiParam({ name: 'trip_id' })
  async getOne(@Param('trip_id') tripId: string, @CurrentUser() user: any) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.tripService.findOne(tenantDbId, tripId);
  }

  @Patch(':trip_id')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Update trip (reorder loads)' })
  @ApiParam({ name: 'trip_id' })
  async update(@Param('trip_id') tripId: string, @CurrentUser() user: any, @Body() dto: UpdateTripDto) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.tripService.update(tenantDbId, tripId, dto);
  }

  @Post(':trip_id/assign')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Assign driver and vehicle to trip' })
  @ApiParam({ name: 'trip_id' })
  async assign(@Param('trip_id') tripId: string, @CurrentUser() user: any, @Body() dto: AssignTripDto) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.tripService.assign(tenantDbId, tripId, dto, user.dbId);
  }

  @Post(':trip_id/loads')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Add a load to an existing trip' })
  @ApiParam({ name: 'trip_id' })
  async addLoad(@Param('trip_id') tripId: string, @CurrentUser() user: any, @Body() dto: AddLoadToTripDto) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.tripService.addLoad(tenantDbId, tripId, dto.loadId, user.dbId);
  }

  @Delete(':trip_id/loads/:load_id')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Remove a load from a trip' })
  @ApiParam({ name: 'trip_id' })
  @ApiParam({ name: 'load_id' })
  async removeLoad(@Param('trip_id') tripId: string, @Param('load_id') loadId: string, @CurrentUser() user: any) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.tripService.removeLoad(tenantDbId, tripId, loadId, user.dbId);
  }

  @Post(':trip_id/cancel')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Cancel a trip and release all loads' })
  @ApiParam({ name: 'trip_id' })
  async cancel(@Param('trip_id') tripId: string, @CurrentUser() user: any) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.tripService.cancel(tenantDbId, tripId, user.dbId);
  }
}
