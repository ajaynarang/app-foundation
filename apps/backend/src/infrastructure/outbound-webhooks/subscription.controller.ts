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
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { WebhookSubscriptionService } from './subscription.service';
import { WebhookDispatcher } from './dispatcher.service';
import { DOMAIN_EVENTS } from '../events/sally-events.constants';
import { CreateWebhookSubscriptionDto, UpdateWebhookSubscriptionDto } from './dto';
import { ReplayWebhookDto } from './dto/replay-webhook.dto';

@Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.DISPATCHER)
@ApiTags('Webhooks')
@ApiBearerAuth()
@Controller('webhooks')
export class SubscriptionController {
  constructor(
    private readonly subscriptionService: WebhookSubscriptionService,
    private readonly dispatcher: WebhookDispatcher,
  ) {}

  @Post()
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
  async findAll(@CurrentUser() user: any, @Query('limit') limit = '20', @Query('offset') offset = '0') {
    return this.subscriptionService.findAll(user.tenantDbId, {
      limit: Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100),
      offset: Math.max(parseInt(offset, 10) || 0, 0),
    });
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

  @Get(':id/logs')
  @ApiOperation({ summary: 'Get delivery logs for a subscription' })
  async getLogs(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Query('limit') limit = '20',
    @Query('offset') offset = '0',
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (dateFrom && !dateRegex.test(dateFrom)) {
      throw new BadRequestException('dateFrom must be in YYYY-MM-DD format');
    }
    if (dateTo && !dateRegex.test(dateTo)) {
      throw new BadRequestException('dateTo must be in YYYY-MM-DD format');
    }
    return this.subscriptionService.findLogs(user.tenantDbId, id, {
      limit: Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100),
      offset: Math.max(parseInt(offset, 10) || 0, 0),
      dateFrom: dateFrom ?? null,
      dateTo: dateTo ?? null,
    });
  }

  @Post(':id/logs/:logId/retry')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Retry a failed webhook delivery' })
  async retryDelivery(@CurrentUser() user: any, @Param('id') id: string, @Param('logId') logId: string) {
    return this.subscriptionService.retryDelivery(user.tenantDbId, id, logId);
  }

  @Post(':id/replay')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Replay events from event log to a subscription' })
  async replayEvents(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: ReplayWebhookDto) {
    const since = new Date(dto.since);
    const maxRange = 7 * 24 * 60 * 60 * 1000; // 7 days
    if (Date.now() - since.getTime() > maxRange) {
      throw new BadRequestException('Replay window cannot exceed 7 days');
    }
    return this.subscriptionService.replayEvents(user.tenantDbId, id, dto);
  }

  @Post(':id/test')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({
    summary: 'Send a test event through the real delivery pipeline',
  })
  async test(@CurrentUser() user: any, @Param('id') id: string) {
    await this.subscriptionService.findOne(user.tenantDbId, id);
    await this.dispatcher.deliverToSubscription(id, DOMAIN_EVENTS.LOAD_CREATED, {
      test: true,
      message: 'This is a test delivery from SALLY',
    });
    return { message: 'Test event queued for delivery' };
  }
}
