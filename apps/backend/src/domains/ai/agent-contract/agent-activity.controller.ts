import { Controller, Get, Query, ParseIntPipe, DefaultValuePipe, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { BaseTenantController } from '../../../shared/base/base-tenant.controller';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { AgentActivityService } from './agent-activity.service';
import type { AgentActivityFilter, AgentActivityPage, AgentPrincipalKind } from '@app/shared-types';

const VALID_PRINCIPAL_KINDS: AgentPrincipalKind[] = ['user', 'desk_responsibility', 'oauth_client', 'api_key'];

const VALID_FILTERS: AgentActivityFilter[] = ['all', 'tool_calls', 'approvals'];

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
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'List agent invocation activity for a principal (redacted args)',
  })
  async list(
    @CurrentUser() user: { tenantId: string },
    @Query('principalKind') principalKind: string,
    @Query('principalId') principalId: string,
    @Query('filter', new DefaultValuePipe('all')) filter: string,
    @Query('cursor') cursor?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ): Promise<AgentActivityPage> {
    if (!VALID_PRINCIPAL_KINDS.includes(principalKind as AgentPrincipalKind)) {
      throw new BadRequestException(`Invalid principalKind. Expected one of: ${VALID_PRINCIPAL_KINDS.join(', ')}`);
    }
    if (!principalId || principalId.length === 0) {
      throw new BadRequestException('principalId is required');
    }
    if (!VALID_FILTERS.includes(filter as AgentActivityFilter)) {
      throw new BadRequestException(`Invalid filter. Expected one of: ${VALID_FILTERS.join(', ')}`);
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (dateFrom && !dateRegex.test(dateFrom)) {
      throw new BadRequestException('dateFrom must be in YYYY-MM-DD format');
    }
    if (dateTo && !dateRegex.test(dateTo)) {
      throw new BadRequestException('dateTo must be in YYYY-MM-DD format');
    }

    const tenantId = await this.getTenantDbId(user);
    return this.activity.list({
      tenantId,
      principalKind: principalKind as AgentPrincipalKind,
      principalId,
      filter: filter as AgentActivityFilter,
      cursor: cursor ?? null,
      limit: limit ?? 50,
      dateFrom: dateFrom ?? null,
      dateTo: dateTo ?? null,
    });
  }
}
