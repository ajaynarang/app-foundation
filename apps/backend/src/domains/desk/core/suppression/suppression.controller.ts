import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { BaseTenantController } from '../../../../shared/base/base-tenant.controller';

import { SnoozeEpisodeDto } from './dto/snooze.dto';
import { SuppressionService } from './suppression.service';

/**
 * HTTP surface for Desk snoozes. Consumed by the Desk UI — the Needs-You
 * sheet footer exposes a "Snooze" dropdown (1d / 3d / 1w / 1mo / forever),
 * and the Handled sheet exposes an "Un-snooze" card when the episode's
 * entity has an active suppression row.
 *
 * Auth: MEMBER + ADMIN + OWNER + SUPER_ADMIN. Tenant scoping:
 *   • snooze   — tenantId resolved from the caller's user, passed to service
 *   • unsnooze — tenantId resolved from the caller and passed to the service
 *                so the service read is `findFirst({ id, tenantId })`, never
 *                `findUnique({ id })`. A leaked UUID from another tenant can
 *                never clear a suppression.
 */
@ApiTags('Desk — Suppressions')
@ApiBearerAuth()
@Controller('desk')
@Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER, UserRole.SUPER_ADMIN)
export class SuppressionController extends BaseTenantController {
  constructor(
    prisma: PrismaService,
    private readonly suppressions: SuppressionService,
  ) {
    super(prisma);
  }

  @Post('episodes/:id/snooze')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Snooze an episode — closes it with outcome=rejected_by_operator and creates/extends a desk_entity_suppressions row',
  })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async snooze(@CurrentUser() user: any, @Param('id', new ParseUUIDPipe()) id: string, @Body() body: SnoozeEpisodeDto) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.suppressions.snooze({
      episodeId: id,
      tenantId: tenantDbId,
      userId: user.dbId,
      duration: body.duration,
      reason: body.reason,
    });
  }

  @Post('suppressions/:id/unsnooze')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Clear an active suppression so the entity can re-surface on the next scheduled sweep',
  })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async unsnooze(@CurrentUser() user: any, @Param('id', new ParseUUIDPipe()) id: string) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.suppressions.unsnooze(id, tenantDbId, user.dbId);
  }
}
