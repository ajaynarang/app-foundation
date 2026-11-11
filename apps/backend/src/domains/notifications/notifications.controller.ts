import { Controller, Get, Post, Param, Query, Body, Logger, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '@appshore/platform/auth/decorators/current-user.decorator';
import { Roles } from '@appshore/platform/auth/decorators/roles.decorator';
import { UserRole } from '@appshore/db';
import { InAppNotificationService } from './notifications.service';
import { NotificationListQueryDto } from './dto/notification-list-query.dto';
import { MarkAllReadDto } from './dto/mark-all-read.dto';

@ApiTags('Notifications')
@Controller('notifications')
@Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
export class NotificationsController {
  private readonly logger = new Logger(NotificationsController.name);

  constructor(private readonly service: InAppNotificationService) {}

  @Get()
  @ApiOperation({ summary: 'List notifications for current user, newest first (cursor-paged)' })
  async list(@CurrentUser() user: any, @Query() query: NotificationListQueryDto) {
    return this.service.listForUser(user.dbId, {
      status: query.status,
      category: query.category,
      limit: query.limit,
      cursor: query.cursor,
    });
  }

  @Get('count')
  @ApiOperation({ summary: 'Get unread notification count' })
  async getUnreadCount(@CurrentUser() user: any) {
    return this.service.getUnreadCount(user.dbId);
  }

  @Post(':notification_id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a notification as read' })
  async markAsRead(@Param('notification_id') notificationId: string, @CurrentUser() user: any) {
    return this.service.markAsRead(notificationId, user.dbId);
  }

  @Post(':notification_id/dismiss')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Dismiss a notification' })
  async dismiss(@Param('notification_id') notificationId: string, @CurrentUser() user: any) {
    return this.service.dismiss(notificationId, user.dbId);
  }

  @Post(':notification_id/unread')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a notification as unread' })
  async markAsUnread(@Param('notification_id') notificationId: string, @CurrentUser() user: any) {
    return this.service.markAsUnread(notificationId, user.dbId);
  }

  @Post('mark-all-read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all notifications as read' })
  async markAllRead(@CurrentUser() user: any, @Body() body: MarkAllReadDto) {
    const result = await this.service.markAllRead(user.dbId, body.category);
    return { updated: result.count };
  }

  @Post('dismiss-all-read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Dismiss all read notifications' })
  async dismissAllRead(@CurrentUser() user: any) {
    const result = await this.service.dismissAllRead(user.dbId);
    return { updated: result.count };
  }
}
