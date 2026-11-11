import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '@appshore/db';
import { BaseTenantController } from '@appshore/platform/shared/base/base-tenant.controller';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { Roles } from '@appshore/platform/auth/decorators/roles.decorator';
import { CurrentUser } from '@appshore/platform/auth/decorators/current-user.decorator';
import { AgentActivityService } from './agent-activity.service';
import type { AgentActivityPage } from '@app/shared-types';
import { AgentActivityQueryDto } from './dto/agent-activity-query.dto';

@ApiTags('Agent Activity')
@ApiBearerAuth()
@Controller('agent-activity')
export class AgentActivityController extends BaseTenantController {
  constructor(
    prisma: PrismaService,
    private readonly activity: AgentActivityService,
  ) {
    super(prisma);
  }

  @Get()
  @Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'List agent invocation activity for a principal (redacted args)',
  })
  async list(
    @CurrentUser() user: { tenantId: string },
    @Query() query: AgentActivityQueryDto,
  ): Promise<AgentActivityPage> {
    const tenantId = await this.getTenantDbId(user);
    return this.activity.list({
      tenantId,
      principalKind: query.principalKind,
      principalId: query.principalId,
      filter: query.filter,
      cursor: query.cursor,
      limit: query.limit,
      dateFrom: query.dateFrom ?? null,
      dateTo: query.dateTo ?? null,
    });
  }
}
