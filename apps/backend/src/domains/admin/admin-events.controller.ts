import { Controller, Get, Logger, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { AdminEventsService } from './admin-events.service';

@Controller('admin/events')
@Roles(UserRole.SUPER_ADMIN)
@ApiTags('Admin Events')
@ApiBearerAuth()
export class AdminEventsController {
  private readonly logger = new Logger(AdminEventsController.name);

  constructor(private readonly adminEventsService: AdminEventsService) {}

  @Get()
  @ApiOperation({ summary: 'List domain events across tenants' })
  async listEvents(
    @Query('search') search?: string,
    @Query('tenant') tenant?: string,
    @Query('actorType') actorType?: string,
    @Query('since') since?: string,
    @Query('until') until?: string,
    @Query('limit') limit = '50',
    @Query('offset') offset = '0',
  ) {
    const parsedLimit = parseInt(limit, 10);
    const parsedOffset = parseInt(offset, 10);

    return this.adminEventsService.listEvents({
      search,
      tenantId: tenant,
      actorType,
      since,
      until,
      limit: Math.min(isNaN(parsedLimit) ? 50 : parsedLimit, 100),
      offset: isNaN(parsedOffset) ? 0 : parsedOffset,
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
