import { Controller, Get, Patch, Param, Body, ParseIntPipe } from '@nestjs/common';
import { Roles } from '@appshore/platform/auth/decorators/roles.decorator';
import { CurrentUser } from '@appshore/platform/auth/decorators/current-user.decorator';
import { UserRole } from '@appshore/db';
import { ScheduleManagerService } from '@appshore/platform/infrastructure/queue/schedule-manager.service';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { ApiOperation, ApiParam } from '@nestjs/swagger';
import { ApiResult } from '@appshore/platform/shared/openapi/api-result';
import { AdminJobScheduleResponse } from './openapi.responses';
import { SystemScope } from '@appshore/kernel/infrastructure/rls/system-scope.decorator';

@Controller('admin/schedules')
@Roles(UserRole.SUPER_ADMIN)
@SystemScope('super-admin')
export class AdminSchedulesController {
  constructor(private readonly scheduleManager: ScheduleManagerService) {}

  @Get()
  @ApiOperation({ summary: 'List the repeatable job schedules, by category and job type' })
  @ApiResult([AdminJobScheduleResponse])
  async listSchedules() {
    return this.scheduleManager.listSchedules();
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a job schedule (pattern, interval, enabled) and reload it in the queue' })
  @ApiParam({ name: 'id', description: 'Job schedule id (numeric)' })
  @ApiResult(AdminJobScheduleResponse)
  async updateSchedule(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateScheduleDto,
    @CurrentUser() user: any,
  ) {
    return this.scheduleManager.updateSchedule(id, body, user.dbId);
  }
}
