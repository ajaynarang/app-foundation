import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@appshore/db';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { NotificationPreferenceOptionsService } from './notification-preference-options.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications/preferences')
@Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER, UserRole.SUPER_ADMIN)
export class NotificationPreferenceOptionsController {
  constructor(private readonly options: NotificationPreferenceOptionsService) {}

  @Get('options')
  @ApiOperation({
    summary: 'Which categories and channels a user may set preferences for, per the notification policy',
  })
  list(@CurrentUser() user: { role?: UserRole }) {
    return this.options.list(user?.role);
  }
}
