import { Controller, Get, Put, Body } from '@nestjs/common';
import { SuperAdminPreferencesService } from './super-admin-preferences.service';
import { UpdateSuperAdminPreferencesDto } from './dto/super-admin-preferences.dto';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UserRole } from '@appshore/db';

@Controller('settings/admin')
export class SuperAdminPreferencesController {
  constructor(private readonly superAdminPreferencesService: SuperAdminPreferencesService) {}

  @Roles(UserRole.SUPER_ADMIN)
  @Get()
  async getPreferences(@CurrentUser() user: any) {
    return this.superAdminPreferencesService.getPreferences(user.userId);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Put()
  async updatePreferences(@CurrentUser() user: any, @Body() dto: UpdateSuperAdminPreferencesDto) {
    return this.superAdminPreferencesService.updatePreferences(user.userId, dto);
  }
}
