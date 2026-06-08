import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { BaseTenantController } from '../../../../shared/base/base-tenant.controller';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { RecurringLanesService } from '../services/recurring-lanes.service';
import { CreateRecurringLaneDto } from '../dto/create-recurring-lane.dto';
import { UpdateRecurringLaneDto } from '../dto/update-recurring-lane.dto';

@ApiTags('Recurring Lanes')
@ApiBearerAuth()
@Controller('recurring-lanes')
export class RecurringLanesController extends BaseTenantController {
  constructor(
    prisma: PrismaService,
    private readonly recurringLanesService: RecurringLanesService,
  ) {
    super(prisma);
  }

  @Post()
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Create a new recurring lane' })
  async create(@CurrentUser() user: any, @Body() dto: CreateRecurringLaneDto) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.recurringLanesService.create({
      tenantId: tenantDbId,
      name: dto.name,
      customerId: dto.customerId,
      customerName: dto.customerName,
      requiredEquipmentType: dto.requiredEquipmentType,
      commodityType: dto.commodityType,
      weightLbs: dto.weightLbs,
      rateCents: dto.rateCents,
      pieces: dto.pieces,
      specialRequirements: dto.specialRequirements,
      referenceNumber: dto.referenceNumber,
      scheduleType: dto.scheduleType,
      scheduleDays: dto.scheduleDays,
      scheduleCustomCron: dto.scheduleCustomCron,
      autoCreate: dto.autoCreate,
      autoAssignDriverId: dto.autoAssignDriverId,
      autoAssignVehicleId: dto.autoAssignVehicleId,
      effectiveFrom: dto.effectiveFrom,
      effectiveUntil: dto.effectiveUntil,
      stops: dto.stops.map((s) => ({
        stopId: s.stopId,
        sequenceOrder: s.sequenceOrder,
        actionType: s.actionType,
        earliestArrival: s.earliestArrival,
        latestArrival: s.latestArrival,
        estimatedDockHours: s.estimatedDockHours,
        dayOffset: s.dayOffset,
        facilityNotes: s.facilityNotes,
      })),
    });
  }

  @Get()
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'List recurring lanes' })
  async findAll(
    @CurrentUser() user: any,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.recurringLanesService.findAll(tenantDbId, {
      search,
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('upcoming')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get upcoming lane generations' })
  async getUpcoming(@CurrentUser() user: any) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.recurringLanesService.getUpcoming(tenantDbId);
  }

  @Get(':id')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get a recurring lane by ID' })
  async findById(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.recurringLanesService.findById(id, tenantDbId);
  }

  @Patch(':id')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Update a recurring lane' })
  async update(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRecurringLaneDto) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.recurringLanesService.update(id, tenantDbId, {
      name: dto.name,
      customerId: dto.customerId,
      customerName: dto.customerName,
      requiredEquipmentType: dto.requiredEquipmentType,
      commodityType: dto.commodityType,
      weightLbs: dto.weightLbs,
      rateCents: dto.rateCents,
      pieces: dto.pieces,
      specialRequirements: dto.specialRequirements,
      referenceNumber: dto.referenceNumber,
      scheduleType: dto.scheduleType,
      scheduleDays: dto.scheduleDays,
      scheduleCustomCron: dto.scheduleCustomCron,
      autoCreate: dto.autoCreate,
      autoAssignDriverId: dto.autoAssignDriverId,
      autoAssignVehicleId: dto.autoAssignVehicleId,
      effectiveFrom: dto.effectiveFrom,
      effectiveUntil: dto.effectiveUntil,
      stops: dto.stops,
    });
  }

  @Delete(':id')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Expire a recurring lane' })
  async expire(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.recurringLanesService.expire(id, tenantDbId);
  }

  @Delete(':id/soft-delete')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Soft delete a recurring lane' })
  async softDelete(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.recurringLanesService.softDelete(id, tenantDbId);
  }

  @Post(':id/activate')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Activate a draft or paused lane' })
  async activate(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.recurringLanesService.activate(id, tenantDbId);
  }

  @Post(':id/pause')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Pause an active lane' })
  async pause(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.recurringLanesService.pause(id, tenantDbId);
  }

  @Post(':id/resume')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Resume a paused lane' })
  async resume(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.recurringLanesService.resume(id, tenantDbId);
  }

  @Post(':id/generate')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Manually generate a load from this lane' })
  async generateLoad(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.recurringLanesService.generateLoad(id, tenantDbId);
  }

  @Post(':id/skip')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Skip the next auto-generation for this lane' })
  async skip(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.recurringLanesService.skip(id, tenantDbId);
  }

  @Get(':id/preview')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Preview what load would be generated' })
  async preview(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.recurringLanesService.preview(id, tenantDbId);
  }
}
