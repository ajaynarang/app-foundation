import { Controller, Get, Post, Param, Query, Body, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '@appshore/db';
import { InAppNotificationService } from './notifications.service';

@ApiTags('Notifications')
@Controller('notifications')
@Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
export class NotificationsController {
  private readonly logger = new Logger(NotificationsController.name);

  constructor(private readonly service: InAppNotificationService) {}

  @Get()
  @ApiOperation({ summary: 'List notifications for current user' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async list(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listForUser(user.dbId, {
      status,
      category,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('count')
  @ApiOperation({ summary: 'Get unread notification count' })
  async getUnreadCount(@CurrentUser() user: any) {
    return this.service.getUnreadCount(user.dbId);
  }

  @Post(':notification_id/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  async markAsRead(@Param('notification_id') notificationId: string, @CurrentUser() user: any) {
    return this.service.markAsRead(notificationId, user.dbId);
  }

  @Post(':notification_id/dismiss')
  @ApiOperation({ summary: 'Dismiss a notification' })
  async dismiss(@Param('notification_id') notificationId: string, @CurrentUser() user: any) {
    return this.service.dismiss(notificationId, user.dbId);
  }

  @Post(':notification_id/unread')
  @ApiOperation({ summary: 'Mark a notification as unread' })
  async markAsUnread(@Param('notification_id') notificationId: string, @CurrentUser() user: any) {
    return this.service.markAsUnread(notificationId, user.dbId);
  }

  @Post('mark-all-read')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  async markAllRead(@CurrentUser() user: any, @Body() body: { category?: string }) {
    const result = await this.service.markAllRead(user.dbId, body.category);
    return { updated: result.count };
  }

  @Post('dismiss-all-read')
  @ApiOperation({ summary: 'Dismiss all read notifications' })
  async dismissAllRead(@CurrentUser() user: any) {
    const result = await this.service.dismissAllRead(user.dbId);
    return { updated: result.count };
  }
}
