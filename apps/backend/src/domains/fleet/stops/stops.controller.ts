import { Controller, Get, Post, Patch, Param, Body, Query, NotFoundException, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { RequireFeature } from '../../../auth/decorators/require-feature.decorator';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { FEATURE_KEYS } from '@sally/shared-types';
import { StopsService } from './stops.service';
import { SearchStopsDto } from './dto/search-stops.dto';
import { CreateStopDto } from './dto/create-stop.dto';
import { UpdateStopDto } from './dto/update-stop.dto';
import { ListStopsDto } from './dto/list-stops.dto';
import { FromPlaceDto } from './dto/from-place.dto';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

@ApiTags('Stops')
@ApiBearerAuth()
@Controller('stops')
export class StopsController {
  constructor(
    private readonly stopsService: StopsService,
    private readonly prisma: PrismaService,
  ) {}

  private async getTenantDbId(user: any): Promise<number> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { tenantId: user.tenantId },
      select: { id: true },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return tenant.id;
  }

  @Get()
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'List stops with pagination and filters' })
  async list(@CurrentUser() user: any, @Query() dto: ListStopsDto) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.stopsService.list(tenantDbId, dto);
  }

  @Get('search')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Search stops with recent and query results' })
  async search(@CurrentUser() user: any, @Query() dto: SearchStopsDto) {
    const tenantDbId = await this.getTenantDbId(user);

    const recent = await this.stopsService.getRecent(tenantDbId);

    let results: Awaited<ReturnType<typeof this.stopsService.search>> = [];
    if (dto.q && dto.q.trim().length > 0) {
      results = await this.stopsService.search(tenantDbId, dto.q.trim(), dto.limit ? Number(dto.limit) : 20);
    }

    return { recent, results };
  }

  @Get(':id')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get stop by ID' })
  async getById(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    const tenantDbId = await this.getTenantDbId(user);
    const stop = await this.stopsService.getById(tenantDbId, id);
    if (!stop) {
      throw new NotFoundException('Stop not found');
    }
    return stop;
  }

  @Post()
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Create a new stop (with dedup)' })
  async create(@CurrentUser() user: any, @Body() body: CreateStopDto) {
    const tenantDbId = await this.getTenantDbId(user);
    const { stop, isNew } = await this.stopsService.findOrCreate(tenantDbId, body);
    return { ...stop, isNew };
  }

  @Post('from-place')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER, UserRole.DRIVER)
  @RequireFeature(FEATURE_KEYS.PLACES_AUTOCOMPLETE)
  @ApiOperation({
    summary: 'Find-or-create a Stop from a Places autocomplete suggestion',
    description:
      'Persists name + address + coordinates from a HERE Autosuggest pick in one round-trip. ' +
      'Dedups against existing stops by proximity, then by address/name.',
  })
  async fromPlace(@CurrentUser() user: any, @Body() body: FromPlaceDto) {
    const tenantDbId = await this.getTenantDbId(user);
    const { stop, isNew } = await this.stopsService.findOrCreateFromPlace(
      tenantDbId,
      body.suggestion,
      body.overrideName,
    );
    return { ...stop, isNew };
  }

  @Patch(':id')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Update a stop' })
  async update(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number, @Body() body: UpdateStopDto) {
    const tenantDbId = await this.getTenantDbId(user);
    const updated = await this.stopsService.update(tenantDbId, id, body);
    if (!updated) {
      throw new NotFoundException('Stop not found');
    }
    // Format to match StopSearchResult shape
    return {
      id: updated.id,
      stopId: updated.stopId,
      name: updated.name,
      address: updated.address,
      city: updated.city,
      state: updated.state,
      zipCode: updated.zipCode,
      lat: updated.lat,
      lon: updated.lon,
      locationType: updated.locationType,
      contactName: updated.contactName,
      contactPhone: updated.contactPhone,
      contactEmail: updated.contactEmail,
      operatingHours: updated.operatingHours,
      appointmentRequired: updated.appointmentRequired,
      notes: updated.notes,
      useCount: 0,
      avgDockHours: undefined,
    };
  }
}
