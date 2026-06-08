import { Controller, Get, Put, Delete, Query, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiParam } from '@nestjs/swagger';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { BaseTenantController } from '../../../shared/base/base-tenant.controller';
import { LaneIntelligenceService } from './lane-intelligence.service';
import { UpsertLaneRateTargetDto } from './lane-intelligence.dto';

@ApiTags('Lane Intelligence')
@ApiBearerAuth()
@Controller('fleet')
export class LaneIntelligenceController extends BaseTenantController {
  constructor(
    prisma: PrismaService,
    private readonly laneIntelligenceService: LaneIntelligenceService,
  ) {
    super(prisma);
  }

  @Get('lane-rate')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({
    summary: 'Get lane rate intelligence for an origin-destination pair',
  })
  @ApiQuery({ name: 'origin_state', required: true, example: 'TX' })
  @ApiQuery({ name: 'destination_state', required: true, example: 'IL' })
  @ApiQuery({ name: 'equipment_type', required: false, example: 'dry_van' })
  async getLaneIntelligence(
    @CurrentUser() user: any,
    @Query('origin_state') originState: string,
    @Query('destination_state') destState: string,
    @Query('equipment_type') equipmentType?: string,
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.laneIntelligenceService.getLaneIntelligence(
      tenantDbId,
      originState.toUpperCase(),
      destState.toUpperCase(),
      equipmentType || undefined,
    );
  }

  @Get('lane-rate-targets')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'List all lane rate targets for the tenant' })
  async listTargets(@CurrentUser() user: any) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.laneIntelligenceService.listTargets(tenantDbId);
  }

  @Put('lane-rate-targets')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Create or update a lane rate target' })
  async upsertTarget(@CurrentUser() user: any, @Body() dto: UpsertLaneRateTargetDto) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.laneIntelligenceService.upsertTarget(tenantDbId, user.dbId, dto);
  }

  @Delete('lane-rate-targets/:lane_rate_target_id')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Delete a lane rate target' })
  @ApiParam({ name: 'lane_rate_target_id' })
  async deleteTarget(@Param('lane_rate_target_id') laneRateTargetId: string, @CurrentUser() user: any) {
    const tenantDbId = await this.getTenantDbId(user);
    await this.laneIntelligenceService.deleteTarget(laneRateTargetId, tenantDbId);
    return { success: true };
  }
}
