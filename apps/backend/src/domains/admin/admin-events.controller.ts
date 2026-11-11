import { Controller, Get, Logger, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '@appshore/platform/auth/decorators/roles.decorator';
import { UserRole } from '@appshore/db';
import { AdminEventsService } from './admin-events.service';
import { AdminEventListQueryDto } from './dto/admin-events-query.dto';

@Controller('admin/events')
@Roles(UserRole.SUPER_ADMIN)
@ApiTags('Admin Events')
@ApiBearerAuth()
export class AdminEventsController {
  private readonly logger = new Logger(AdminEventsController.name);

  constructor(private readonly adminEventsService: AdminEventsService) {}

  @Get()
  @ApiOperation({ summary: 'List domain events across tenants' })
  async listEvents(@Query() query: AdminEventListQueryDto) {
    return this.adminEventsService.listEvents({
      search: query.q,
      tenantId: query.tenantId,
      actorType: query.actorType,
      since: query.since,
      until: query.until,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get event volume stats' })
  async getStats() {
    return this.adminEventsService.getStats();
  }

  @Get('volume')
  @ApiOperation({ summary: 'Get hourly event volume for last 24h' })
  async getVolume() {
    return this.adminEventsService.getVolume();
  }

  @Get('webhooks/health')
  @ApiOperation({ summary: 'Get webhook delivery health across tenants' })
  async getWebhookHealth() {
    return this.adminEventsService.getWebhookHealth();
  }
}
