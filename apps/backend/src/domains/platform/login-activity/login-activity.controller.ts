import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { BaseTenantController } from '../../../shared/base/base-tenant.controller';
import { LoginActivityService } from './login-activity.service';
import { ListLoginActivityQueryDto } from './dto/list-login-activity.query.dto';
import { LoginActivitySummaryQueryDto } from './dto/login-activity-summary.query.dto';

@ApiTags('Login Activity')
@ApiBearerAuth()
@Controller('admin/login-activity')
export class LoginActivityController extends BaseTenantController {
  constructor(
    prisma: PrismaService,
    private readonly loginActivity: LoginActivityService,
  ) {
    super(prisma);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: "List login events for the caller's tenant" })
  async list(@CurrentUser() user: any, @Query() query: ListLoginActivityQueryDto) {
    const tenantDbId = await this.getTenantDbId(user);
    // `excludeSuperAdmin` is a Super-Admin-only filter — strip it here as
    // defense-in-depth even though no SUPER_ADMIN users live in a tenant.
    const { tenantId: _ignoredTenant, excludeSuperAdmin: _ignoredFlag, ...safe } = query;
    return this.loginActivity.list({ isSuperAdmin: false, tenantId: tenantDbId }, safe);
  }

  @Get('summary')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: "Login activity KPIs + Notable for the caller's tenant" })
  async summary(@CurrentUser() user: any, @Query() query: LoginActivitySummaryQueryDto) {
    const tenantDbId = await this.getTenantDbId(user);
    const { tenantId: _ignoredTenant, excludeSuperAdmin: _ignoredFlag, ...safe } = query;
    return this.loginActivity.summary({ isSuperAdmin: false, tenantId: tenantDbId }, safe);
  }
}
