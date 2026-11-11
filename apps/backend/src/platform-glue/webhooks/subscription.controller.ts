import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '@appshore/db';
import { Roles } from '@appshore/platform/auth/decorators/roles.decorator';
import { CurrentUser } from '@appshore/platform/auth/decorators/current-user.decorator';
import { WebhookSubscriptionService } from './subscription.service';
import { WebhookDispatcher } from './dispatcher.service';
import { DOMAIN_EVENTS } from '../events/domain-events.constants';
import { CreateWebhookSubscriptionDto, RotateWebhookSecretDto, UpdateWebhookSubscriptionDto } from './dto';
import { ReplayWebhookDto } from './dto/replay-webhook.dto';
import { WebhookListQueryDto, WebhookLogListQueryDto } from './dto/webhook-list-query.dto';
import { fieldError } from '@appshore/kernel/shared/errors/api-errors';

@Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.MEMBER)
@ApiTags('Webhooks')
@ApiBearerAuth()
@Controller('webhooks')
export class SubscriptionController {
  constructor(
    private readonly subscriptionService: WebhookSubscriptionService,
    private readonly dispatcher: WebhookDispatcher,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Register a webhook subscription' })
  async create(@CurrentUser() user: any, @Body() body: CreateWebhookSubscriptionDto) {
    return this.subscriptionService.create(user.tenantDbId, body);
  }

  @Get('events')
  @ApiOperation({
    summary: 'Get event catalog (external events grouped by category)',
  })
  getEventCatalog() {
    return this.subscriptionService.getEventCatalog();
  }

  @Get()
  @ApiOperation({ summary: 'List webhook subscriptions' })
  async findAll(@CurrentUser() user: any, @Query() query: WebhookListQueryDto) {
    return this.subscriptionService.findAll(user.tenantDbId, { limit: query.limit, offset: query.offset });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single webhook subscription' })
  async findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.subscriptionService.findOne(user.tenantDbId, id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Update webhook subscription' })
  async update(@CurrentUser() user: any, @Param('id') id: string, @Body() body: UpdateWebhookSubscriptionDto) {
    return this.subscriptionService.update(user.tenantDbId, id, body);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete (deactivate) a webhook subscription' })
  async remove(@CurrentUser() user: any, @Param('id') id: string) {
    await this.subscriptionService.softDelete(user.tenantDbId, id);
  }

  @Post(':id/rotate-secret')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({
    summary: 'Rotate the signing secret. The new secret is shown once; the old one keeps signing for the overlap',
  })
  async rotateSecret(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: RotateWebhookSecretDto) {
    return this.subscriptionService.rotateSecret(user.tenantDbId, id, dto);
  }

  @Get(':id/logs')
  @ApiOperation({ summary: 'Get delivery logs for a subscription' })
  async getLogs(@CurrentUser() user: any, @Param('id') id: string, @Query() query: WebhookLogListQueryDto) {
    return this.subscriptionService.findLogs(user.tenantDbId, id, {
      limit: query.limit,
      offset: query.offset,
      dateFrom: query.dateFrom ?? null,
      dateTo: query.dateTo ?? null,
    });
  }

  @Post(':id/logs/:log_id/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Retry a failed webhook delivery' })
  async retryDelivery(@CurrentUser() user: any, @Param('id') id: string, @Param('log_id') logId: string) {
    return this.subscriptionService.retryDelivery(user.tenantDbId, id, logId);
  }

  @Post(':id/replay')
  @HttpCode(HttpStatus.ACCEPTED)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Replay events from event log to a subscription' })
  async replayEvents(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: ReplayWebhookDto) {
    const since = new Date(dto.since);
    const maxRange = 7 * 24 * 60 * 60 * 1000; // 7 days
    if (Date.now() - since.getTime() > maxRange) {
      throw fieldError('since', 'Pick a time within the last 7 days');
    }
    return this.subscriptionService.replayEvents(user.tenantDbId, id, dto);
  }

  @Post(':id/test')
  @HttpCode(HttpStatus.ACCEPTED)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({
    summary: 'Send a test event through the real delivery pipeline',
  })
  async test(@CurrentUser() user: any, @Param('id') id: string) {
    await this.subscriptionService.findOne(user.tenantDbId, id);
    const logId = await this.dispatcher.deliverToSubscription(id, DOMAIN_EVENTS.NOTIFICATION_CREATED, {
      test: true,
      message: 'This is a test webhook delivery',
    });
    if (!logId) throw new ServiceUnavailableException('The test event could not be queued. Please try again.');
    // 202 with the record to poll: the queued delivery, to follow in the log.
    return this.subscriptionService.getDeliveryLog(user.tenantDbId, id, logId);
  }
}
