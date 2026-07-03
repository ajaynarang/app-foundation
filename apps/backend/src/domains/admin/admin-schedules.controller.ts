import { Controller, Get, Patch, Param, Body, ParseIntPipe } from '@nestjs/common';
import { Roles } from '@appshore/platform/auth/decorators/roles.decorator';
import { CurrentUser } from '@appshore/platform/auth/decorators/current-user.decorator';
import { UserRole } from '@appshore/db';
import { ScheduleManagerService } from '@appshore/platform/infrastructure/queue/schedule-manager.service';
import { UpdateScheduleDto } from './dto/update-schedule.dto';

@Controller('admin/schedules')
@Roles(UserRole.SUPER_ADMIN)
export class AdminSchedulesController {
  constructor(private readonly scheduleManager: ScheduleManagerService) {}

  @Get()
  async listSchedules() {
    return this.scheduleManager.listSchedules();
  }

  @Patch(':id')
  async updateSchedule(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateScheduleDto,
    @CurrentUser() user: any,
  ) {
    return this.scheduleManager.updateSchedule(id, body, user.dbId);
  }
}
