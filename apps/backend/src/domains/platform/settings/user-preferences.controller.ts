import { Controller, Get, Put, Post, Body } from '@nestjs/common';
import { UserPreferencesService } from './user-preferences.service';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { UpdateUserPreferencesDto } from './dto/user-preferences.dto';
import { UpdateDriverPreferencesDto } from './dto/driver-preferences.dto';

@Controller('settings')
@Roles(UserRole.DRIVER, UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER, UserRole.SUPER_ADMIN)
export class UserPreferencesController {
  constructor(private readonly userPreferencesService: UserPreferencesService) {}

  @Get('general')
  async getUserPreferences(@CurrentUser() user: any) {
    return this.userPreferencesService.getUserPreferences(user.userId);
  }

  @Put('general')
  async updateUserPreferences(@CurrentUser() user: any, @Body() dto: UpdateUserPreferencesDto) {
    return this.userPreferencesService.updateUserPreferences(user.userId, dto);
  }

  @Get('driver')
  async getDriverPreferences(@CurrentUser() user: any) {
    return this.userPreferencesService.getDriverPreferences(user.userId);
  }

  @Put('driver')
  async updateDriverPreferences(@CurrentUser() user: any, @Body() dto: UpdateDriverPreferencesDto) {
    return this.userPreferencesService.updateDriverPreferences(user.userId, dto);
  }

  @Post('reset')
  async resetToDefaults(@CurrentUser() user: any, @Body() body: { scope: 'user' | 'driver' }) {
    return this.userPreferencesService.resetToDefaults(user.userId, body.scope);
  }
}
