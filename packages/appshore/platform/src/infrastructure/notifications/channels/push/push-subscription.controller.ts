import { Controller, Post, Delete, Get, Body, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { PushService } from './web-push.service';
import { SubscribePushDto, UnsubscribePushDto } from './dto/push-subscription.dto';
import { ApiResult } from '../../../../shared/openapi/api-result';
import { PushVapidKey } from './openapi.responses';

@ApiTags('Push Notifications')
@Controller('push')
export class PushSubscriptionController {
  private readonly logger = new Logger(PushSubscriptionController.name);

  constructor(private readonly pushService: PushService) {}

  @Get('vapid-key')
  @ApiOperation({ summary: 'Get VAPID public key for push subscription' })
  @ApiResult(PushVapidKey)
  getVapidKey() {
    return { publicKey: this.pushService.getPublicKey() || '' };
  }

  // 204: the subscription is keyed by the endpoint the browser already holds, so there is nothing to send back.
  @Post('subscribe')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Register a push notification subscription' })
  @ApiNoContentResponse({ description: 'Subscription saved' })
  async subscribe(@CurrentUser() user: any, @Body() body: SubscribePushDto): Promise<void> {
    await this.pushService.saveSubscription(user.dbId, user.tenantDbId, body.subscription);
  }

  @Delete('unsubscribe')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a push notification subscription' })
  @ApiNoContentResponse({ description: 'Subscription removed' })
  async unsubscribe(@CurrentUser() user: any, @Body() body: UnsubscribePushDto): Promise<void> {
    await this.pushService.removeSubscription(user.dbId, body.endpoint);
  }
}
