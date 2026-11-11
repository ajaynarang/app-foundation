import { Controller, Get, Put, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { UserPreferencesService } from './user-preferences.service';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '@appshore/db';
import { UpdateUserPreferencesDto } from './dto/user-preferences.dto';
import { ResetPreferencesDto } from './dto/reset-preferences.dto';

@Controller('settings')
@Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER, UserRole.SUPER_ADMIN)
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

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  async resetToDefaults(@CurrentUser() user: any, @Body() body: ResetPreferencesDto) {
    return this.userPreferencesService.resetToDefaults(user.userId, body.scope);
  }
}
