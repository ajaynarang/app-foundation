import { Controller, Get, Put, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { UserPreferencesService } from './user-preferences.service';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '@appshore/db';
import { UpdateUserPreferencesDto } from './dto/user-preferences.dto';
import { ResetPreferencesDto } from './dto/reset-preferences.dto';
import { ApiOperation } from '@nestjs/swagger';
import { ApiResult } from '../../shared/openapi/api-result';
import { UserPreferencesRecordResponse } from './openapi.responses';

@Controller('settings')
@Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER, UserRole.SUPER_ADMIN)
export class UserPreferencesController {
  constructor(private readonly userPreferencesService: UserPreferencesService) {}

  @Get('general')
  @ApiOperation({ summary: "The current user's preferences — created with defaults on first read" })
  @ApiResult(UserPreferencesRecordResponse)
  async getUserPreferences(@CurrentUser() user: any) {
    return this.userPreferencesService.getUserPreferences(user.userId);
  }

  @Put('general')
  @ApiOperation({ summary: "Update the current user's preferences (only the fields sent)" })
  @ApiResult(UserPreferencesRecordResponse)
  async updateUserPreferences(@CurrentUser() user: any, @Body() dto: UpdateUserPreferencesDto) {
    return this.userPreferencesService.updateUserPreferences(user.userId, dto);
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Reset the current user's preferences to the defaults" })
  @ApiResult(UserPreferencesRecordResponse)
  async resetToDefaults(@CurrentUser() user: any, @Body() body: ResetPreferencesDto) {
    return this.userPreferencesService.resetToDefaults(user.userId, body.scope);
  }
}
