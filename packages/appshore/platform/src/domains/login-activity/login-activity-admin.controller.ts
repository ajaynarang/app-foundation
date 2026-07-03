import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@appshore/db';
import { Roles } from '../../auth/decorators/roles.decorator';
import { LoginActivityService } from './login-activity.service';
import { ListLoginActivityQueryDto } from './dto/list-login-activity.query.dto';
import { LoginActivitySummaryQueryDto } from './dto/login-activity-summary.query.dto';

@ApiTags('Login Activity (Super Admin)')
@ApiBearerAuth()
@Controller('super-admin/login-activity')
export class LoginActivityAdminController {
  constructor(private readonly loginActivity: LoginActivityService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'List login events across all tenants (optionally filtered by tenantId)' })
  async list(@Query() query: ListLoginActivityQueryDto) {
    return this.loginActivity.list({ isSuperAdmin: true, tenantId: query.tenantId }, query);
  }

  @Get('summary')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'KPIs + Notable across all tenants (optionally filtered by tenantId)' })
  async summary(@Query() query: LoginActivitySummaryQueryDto) {
    return this.loginActivity.summary({ isSuperAdmin: true, tenantId: query.tenantId }, query);
  }
}
