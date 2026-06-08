import { Controller, Get, Post, Put, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { BaseTenantController } from '../../../../shared/base/base-tenant.controller';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import { TrailersService } from '../services/trailers.service';
import { CreateTrailerDto, UpdateTrailerDto } from '../dto';

/**
 * TrailersController handles HTTP requests for trailer management.
 * Extends BaseTenantController for tenant utilities.
 */
@ApiTags('Trailers')
@ApiBearerAuth()
@Controller('trailers')
export class TrailersController extends BaseTenantController {
  constructor(
    prisma: PrismaService,
    private readonly trailersService: TrailersService,
  ) {
    super(prisma);
  }

  @Get()
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'List all active trailers' })
  async listTrailers(@CurrentUser() user: any, @Query('includeInactive') includeInactive?: string) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.trailersService.findAll(tenantDbId, includeInactive === 'true');
  }

  @Get('inactive/list')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'List all inactive and decommissioned trailers' })
  async listInactiveTrailers(@CurrentUser() user: any) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.trailersService.findInactive(tenantDbId);
  }

  @Get(':trailer_id')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get trailer by ID' })
  @ApiParam({ name: 'trailer_id', description: 'Trailer ID (e.g. TRL-XXX)' })
  async getTrailer(@Param('trailer_id') trailerId: string, @CurrentUser() user: any) {
    const tenantDbId = await this.getTenantDbId(user);
    const trailer = await this.trailersService.findOne(trailerId, tenantDbId);
    return this.trailersService.formatResponse(trailer);
  }

  @Post()
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Create a new trailer' })
  async createTrailer(@CurrentUser() user: any, @Body() dto: CreateTrailerDto) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.trailersService.create(tenantDbId, dto);
  }

  @Put(':trailer_id')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Update a trailer' })
  @ApiParam({ name: 'trailer_id', description: 'Trailer ID' })
  async updateTrailer(@Param('trailer_id') trailerId: string, @CurrentUser() user: any, @Body() dto: UpdateTrailerDto) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.trailersService.update(trailerId, tenantDbId, dto);
  }

  @Post(':trailer_id/deactivate')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Deactivate a trailer' })
  @ApiParam({ name: 'trailer_id', description: 'Trailer ID' })
  async deactivateTrailer(
    @Param('trailer_id') trailerId: string,
    @Body() body: { reason: string },
    @CurrentUser() user: any,
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.trailersService.deactivate(trailerId, tenantDbId, user.dbId, body.reason);
  }

  @Post(':trailer_id/reactivate')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Reactivate an inactive trailer' })
  @ApiParam({ name: 'trailer_id', description: 'Trailer ID' })
  async reactivateTrailer(@Param('trailer_id') trailerId: string, @CurrentUser() user: any) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.trailersService.reactivate(trailerId, tenantDbId, user.dbId);
  }

  @Post(':trailer_id/decommission')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Decommission a trailer (permanent)' })
  @ApiParam({ name: 'trailer_id', description: 'Trailer ID' })
  async decommissionTrailer(
    @Param('trailer_id') trailerId: string,
    @Body() body: { reason: string },
    @CurrentUser() user: any,
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.trailersService.decommission(trailerId, tenantDbId, user.dbId, body.reason);
  }

  @Post(':trailer_id/assign-vehicle')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Assign (hook) a vehicle to a trailer' })
  @ApiParam({ name: 'trailer_id', description: 'Trailer ID' })
  async assignVehicle(
    @Param('trailer_id') trailerId: string,
    @Body() body: { vehicleId: number },
    @CurrentUser() user: any,
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.trailersService.assignVehicle(trailerId, tenantDbId, body.vehicleId);
  }

  @Post(':trailer_id/unassign-vehicle')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Unassign (unhook) the vehicle from a trailer' })
  @ApiParam({ name: 'trailer_id', description: 'Trailer ID' })
  async unassignVehicle(@Param('trailer_id') trailerId: string, @CurrentUser() user: any) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.trailersService.unassignVehicle(trailerId, tenantDbId);
  }
}
