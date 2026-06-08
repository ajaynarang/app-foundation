import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { AnnouncementsService } from './announcements.service';

@ApiTags('Broadcasts')
@Controller('broadcasts')
@ApiBearerAuth()
export class BroadcastsPublicController {
  constructor(private readonly service: AnnouncementsService) {}

  @Get('active')
  @ApiOperation({ summary: 'Get active broadcasts for current tenant' })
  findActive(@CurrentUser() user: any) {
    const tenantId = user?.tenantId;
    const planSlug = user?.planSlug;

    // SUPER_ADMIN users don't have a tenantId — only return ALL-targeted broadcasts
    if (!tenantId) {
      return this.service.findActiveForAllOnly();
    }

    return this.service.findActiveForTenant(tenantId, planSlug);
  }
}
