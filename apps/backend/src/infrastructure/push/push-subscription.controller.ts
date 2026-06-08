import { Controller, Post, Delete, Get, Body, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { PushService } from './push.service';

@ApiTags('Push Notifications')
@Controller('push')
export class PushSubscriptionController {
  private readonly logger = new Logger(PushSubscriptionController.name);

  constructor(private readonly pushService: PushService) {}

  @Get('vapid-key')
  @ApiOperation({ summary: 'Get VAPID public key for push subscription' })
  getVapidKey() {
    return { publicKey: this.pushService.getPublicKey() || '' };
  }

  @Post('subscribe')
  @ApiOperation({ summary: 'Register a push notification subscription' })
  async subscribe(
    @CurrentUser() user: any,
    @Body()
    body: {
      subscription: {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      };
    },
  ) {
    await this.pushService.saveSubscription(user.dbId, user.tenantDbId, body.subscription);
    return { message: 'Push subscription registered' };
  }

  @Delete('unsubscribe')
  @ApiOperation({ summary: 'Remove a push notification subscription' })
  async unsubscribe(@CurrentUser() user: any, @Body() body: { endpoint: string }) {
    await this.pushService.removeSubscription(user.dbId, body.endpoint);
    return { message: 'Push subscription removed' };
  }
}
