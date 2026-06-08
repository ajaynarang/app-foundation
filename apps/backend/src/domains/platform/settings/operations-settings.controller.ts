import { Controller, Get, Put, Post, Body } from '@nestjs/common';
import { OperationsSettingsService } from './operations-settings.service';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { UpdateOperationsSettingsDto } from './dto/operations-settings.dto';
import { UserRole } from '@prisma/client';

@Controller('settings/operations')
export class OperationsSettingsController {
  constructor(private readonly operationsSettingsService: OperationsSettingsService) {}

  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.DISPATCHER)
  @Get()
  async getSettings(@CurrentUser() user: any) {
    return this.operationsSettingsService.getSettings(user.tenantDbId);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Put()
  async updateSettings(@CurrentUser() user: any, @Body() dto: UpdateOperationsSettingsDto) {
    return this.operationsSettingsService.updateSettings(user.tenantDbId, dto);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Post('reset')
  async resetToDefaults(@CurrentUser() user: any) {
    return this.operationsSettingsService.resetToDefaults(user.tenantDbId);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.DISPATCHER)
  @Get('defaults')
  getDefaults() {
    return this.operationsSettingsService.getDefaults();
  }
}
