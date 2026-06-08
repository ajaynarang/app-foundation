import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import { BaseTenantController } from '../../../../shared/base/base-tenant.controller';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

import { DeskScheduleService } from './desk-schedule.service';
import { UpdateDeskScheduleDto } from './dto/update-desk-schedule.dto';

/**
 * HTTP surface for the tenant-wide Desk schedule master switch.
 *
 * GET is readable by any desk role so the UI can show whether automatic runs
 * are armed. PATCH is OWNER/ADMIN/SUPER_ADMIN only — pausing or arming every
 * schedule tenant-wide is an account-level safety control, not a per-agent
 * tweak a dispatcher makes.
 */
@ApiTags('Desk — Schedule')
@ApiBearerAuth()
@Controller('desk/schedule')
export class DeskScheduleController extends BaseTenantController {
  constructor(
    prisma: PrismaService,
    private readonly schedule: DeskScheduleService,
  ) {
    super(prisma);
  }

  @Get()
  @Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get the tenant-wide autonomous-run master switch state' })
  async get(@CurrentUser() user: any) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.schedule.getState(tenantDbId);
  }

  @Patch()
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Arm or pause all autonomous Desk runs tenant-wide' })
  async update(@CurrentUser() user: any, @Body() body: UpdateDeskScheduleDto) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.schedule.setState(tenantDbId, body.enabled);
  }
}
