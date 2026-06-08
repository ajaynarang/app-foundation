import { Controller, Get, Patch, Param, Body, ParseIntPipe } from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { ScheduleManagerService } from '../../infrastructure/queue/schedule-manager.service';
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
