import { Controller, Post, Patch, Get, Param, Body, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { BaseTenantController } from '../../../../shared/base/base-tenant.controller';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { DriverActionsService } from '../services/driver-actions.service';
import { CreateDriverActionDto, ResolveDriverActionDto } from '../dto/driver-action.dto';

@ApiTags('Driver Actions')
@ApiBearerAuth()
@Controller('loads/:loadId/driver-actions')
export class DriverActionsController extends BaseTenantController {
  constructor(
    prisma: PrismaService,
    private readonly driverActionsService: DriverActionsService,
  ) {
    super(prisma);
  }

  @Post()
  @Roles(UserRole.DRIVER)
  @ApiOperation({
    summary: 'Submit driver action (detention, scale, fuel, issue)',
  })
  @ApiParam({ name: 'loadId' })
  async create(@Param('loadId') loadId: string, @Body() dto: CreateDriverActionDto, @CurrentUser() user: any) {
    const tenantId = await this.getTenantDbId(user);
    if (!user.driverDbId) throw new NotFoundException('Driver profile not found');
    const load = await this.prisma.load.findFirst({
      where: { loadNumber: loadId, tenantId },
      select: { id: true, driverId: true },
    });
    if (!load) throw new NotFoundException('Load not found');
    if (load.driverId !== user.driverDbId) {
      throw new ForbiddenException('You are not assigned to this load');
    }

    return this.driverActionsService.create({
      tenantId,
      loadId: load.id,
      driverId: user.driverDbId,
      stopId: dto.stopId,
      actionType: dto.actionType,
      note: dto.note,
      metadata: dto.metadata,
    });
  }

  @Patch(':actionRequestId/acknowledge')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Acknowledge driver action' })
  @ApiParam({ name: 'loadId' })
  @ApiParam({ name: 'actionRequestId' })
  async acknowledge(@Param('actionRequestId') actionRequestId: string, @CurrentUser() user: any) {
    const tenantId = await this.getTenantDbId(user);
    return this.driverActionsService.acknowledge(actionRequestId, tenantId, user.dbId);
  }

  @Patch(':actionRequestId/resolve')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Resolve driver action' })
  @ApiParam({ name: 'loadId' })
  @ApiParam({ name: 'actionRequestId' })
  async resolve(
    @Param('actionRequestId') actionRequestId: string,
    @Body() dto: ResolveDriverActionDto,
    @CurrentUser() user: any,
  ) {
    const tenantId = await this.getTenantDbId(user);
    return this.driverActionsService.resolve({
      actionRequestId,
      tenantId,
      documentId: dto.documentId,
      loadChargeId: dto.loadChargeId,
    });
  }

  @Get()
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.DRIVER)
  @ApiOperation({ summary: 'List driver actions for a load' })
  @ApiParam({ name: 'loadId' })
  async list(@Param('loadId') loadId: string, @CurrentUser() user: any) {
    const tenantId = await this.getTenantDbId(user);
    const load = await this.prisma.load.findFirst({
      where: { loadNumber: loadId, tenantId },
      select: { id: true },
    });
    if (!load) throw new NotFoundException('Load not found');
    return this.driverActionsService.getByLoad(load.id, tenantId);
  }
}
