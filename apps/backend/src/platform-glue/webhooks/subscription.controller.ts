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
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
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
import { ApiResult } from '@appshore/platform/shared/openapi/api-result';
import {
  WebhookDeliveryLogListResponse,
  WebhookDeliveryLogResponse,
  WebhookEventCatalogResponse,
  WebhookReplayResponse,
  WebhookSubscriptionCreatedResponse,
  WebhookSubscriptionDetailResponse,
  WebhookSubscriptionListResponse,
  WebhookSubscriptionResponse,
  WebhookSubscriptionWithSecretResponse,
} from './openapi.responses';

const SUBSCRIPTION_ID_PARAM = { name: 'id', description: 'Webhook subscription id' } as const;
const LOG_ID_PARAM = { name: 'log_id', description: 'Delivery log id (uuid)' } as const;

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
  @ApiOperation({ summary: 'Register a webhook subscription; the signing secret is shown on this response only' })
  @ApiResult(WebhookSubscriptionCreatedResponse, HttpStatus.CREATED)
  async create(@CurrentUser() user: any, @Body() body: CreateWebhookSubscriptionDto) {
    return this.subscriptionService.create(user.tenantDbId, body);
  }

  @Get('events')
  @ApiOperation({
    summary: 'Get event catalog (external events grouped by category)',
  })
  @ApiResult(WebhookEventCatalogResponse)
  getEventCatalog() {
    return this.subscriptionService.getEventCatalog();
  }

  @Get()
  @ApiOperation({ summary: 'List webhook subscriptions' })
  @ApiResult(WebhookSubscriptionListResponse)
  async findAll(@CurrentUser() user: any, @Query() query: WebhookListQueryDto) {
    return this.subscriptionService.findAll(user.tenantDbId, { limit: query.limit, cursor: query.cursor });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single webhook subscription' })
  @ApiParam(SUBSCRIPTION_ID_PARAM)
  @ApiResult(WebhookSubscriptionDetailResponse)
  async findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.subscriptionService.findOne(user.tenantDbId, id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Update webhook subscription' })
  @ApiParam(SUBSCRIPTION_ID_PARAM)
  @ApiResult(WebhookSubscriptionResponse)
  async update(@CurrentUser() user: any, @Param('id') id: string, @Body() body: UpdateWebhookSubscriptionDto) {
    return this.subscriptionService.update(user.tenantDbId, id, body);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete (deactivate) a webhook subscription' })
  @ApiParam(SUBSCRIPTION_ID_PARAM)
  @ApiNoContentResponse({ description: 'Deactivated' })
  async remove(@CurrentUser() user: any, @Param('id') id: string) {
    await this.subscriptionService.softDelete(user.tenantDbId, id);
  }

  @Post(':id/rotate-secret')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({
    summary: 'Rotate the signing secret. The new secret is shown once; the old one keeps signing for the overlap',
  })
  @ApiParam(SUBSCRIPTION_ID_PARAM)
  @ApiResult(WebhookSubscriptionWithSecretResponse)
  async rotateSecret(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: RotateWebhookSecretDto) {
    return this.subscriptionService.rotateSecret(user.tenantDbId, id, dto);
  }

  @Get(':id/logs')
  @ApiOperation({ summary: 'Get delivery logs for a subscription' })
  @ApiParam(SUBSCRIPTION_ID_PARAM)
  @ApiResult(WebhookDeliveryLogListResponse)
  async getLogs(@CurrentUser() user: any, @Param('id') id: string, @Query() query: WebhookLogListQueryDto) {
    return this.subscriptionService.findLogs(user.tenantDbId, id, {
      limit: query.limit,
      cursor: query.cursor,
      dateFrom: query.dateFrom ?? null,
      dateTo: query.dateTo ?? null,
    });
  }

  @Post(':id/logs/:log_id/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Retry a failed webhook delivery' })
  @ApiParam(SUBSCRIPTION_ID_PARAM)
  @ApiParam(LOG_ID_PARAM)
  @ApiResult(WebhookDeliveryLogResponse, HttpStatus.ACCEPTED)
  async retryDelivery(@CurrentUser() user: any, @Param('id') id: string, @Param('log_id') logId: string) {
    return this.subscriptionService.retryDelivery(user.tenantDbId, id, logId);
  }

  @Post(':id/replay')
  @HttpCode(HttpStatus.ACCEPTED)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Replay events from event log to a subscription' })
  @ApiParam(SUBSCRIPTION_ID_PARAM)
  @ApiResult(WebhookReplayResponse, HttpStatus.ACCEPTED)
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
  @ApiParam(SUBSCRIPTION_ID_PARAM)
  @ApiResult(WebhookDeliveryLogResponse, HttpStatus.ACCEPTED)
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
