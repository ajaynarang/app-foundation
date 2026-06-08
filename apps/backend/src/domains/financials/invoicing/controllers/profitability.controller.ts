import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { BaseTenantController } from '../../../../shared/base/base-tenant.controller';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { ProfitabilityService } from '../services/profitability.service';

@ApiTags('Profitability')
@ApiBearerAuth()
@Controller('profitability')
export class ProfitabilityController extends BaseTenantController {
  constructor(
    prisma: PrismaService,
    private readonly profitabilityService: ProfitabilityService,
  ) {
    super(prisma);
  }

  @Get('loads/:load_id')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get profitability breakdown for a single load' })
  async getForLoad(@CurrentUser() user: any, @Param('load_id') loadId: string) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.profitabilityService.calculateForLoad(tenantDbId, loadId);
  }

  @Get('loads')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get profitability for recent delivered loads' })
  @ApiQuery({ name: 'limit', required: false })
  async getForTenant(@CurrentUser() user: any, @Query('limit') limit = '50') {
    const tenantDbId = await this.getTenantDbId(user);
    return this.profitabilityService.calculateForTenant(tenantDbId, Number(limit));
  }
}
