import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { BaseTenantController } from '../../../../shared/base/base-tenant.controller';
import { DriverTimelineService } from '../services/driver-timeline.service';

@ApiTags('Driver Timeline')
@ApiBearerAuth()
@Controller('driver/sally')
export class DriverTimelineController extends BaseTenantController {
  constructor(
    prisma: PrismaService,
    private readonly timelineService: DriverTimelineService,
  ) {
    super(prisma);
  }

  @Get('timeline')
  @Roles(UserRole.DRIVER)
  @ApiOperation({ summary: 'Get unified Sally timeline for the driver' })
  @ApiQuery({ name: 'load_id', required: false })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getTimeline(
    @CurrentUser() user: any,
    @Query('load_id') loadId?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limitStr?: string,
  ) {
    const tenantDbId = await this.getTenantDbId(user);

    if (!user.driverDbId) {
      return { entries: [], cursor: null, loadContext: null };
    }

    const limit = limitStr ? Math.min(Math.max(parseInt(limitStr, 10) || 50, 1), 100) : 50;
    return this.timelineService.getTimeline(tenantDbId, user.driverDbId, loadId, cursor, limit);
  }
}
