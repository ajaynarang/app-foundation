import { Controller, Get, Post, Body, Param, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { BaseTenantController } from '../../../../shared/base/base-tenant.controller';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { LoadsService } from '../services/loads.service';

@ApiTags('Customer Loads')
@ApiBearerAuth()
@Controller('customer/loads')
export class CustomerLoadsController extends BaseTenantController {
  constructor(
    prisma: PrismaService,
    private readonly loadsService: LoadsService,
  ) {
    super(prisma);
  }

  @Get()
  @Roles(UserRole.CUSTOMER)
  @ApiOperation({ summary: 'List loads for authenticated customer' })
  async getMyLoads(@CurrentUser() user: any) {
    if (!user.customerId) {
      throw new ForbiddenException('No customer account linked');
    }
    return this.loadsService.findByCustomerId(user.customerDbId, user.tenantDbId);
  }

  @Get(':load_id')
  @Roles(UserRole.CUSTOMER)
  @ApiOperation({ summary: 'Get load detail for customer' })
  async getLoad(@CurrentUser() user: any, @Param('load_id') loadId: string) {
    if (!user.customerId) {
      throw new ForbiddenException('No customer account linked');
    }
    return this.loadsService.findOneForCustomer(loadId, user.customerDbId);
  }

  @Post('request')
  @Roles(UserRole.CUSTOMER)
  @ApiOperation({
    summary: 'Submit a load request (creates draft for dispatcher)',
  })
  async requestLoad(@CurrentUser() user: any, @Body() body: any) {
    if (!user.customerId) {
      throw new ForbiddenException('No customer account linked');
    }
    const tenantDbId = await this.getTenantDbId(user);
    return this.loadsService.createFromCustomerRequest({
      ...body,
      tenant_id: tenantDbId,
      customer_id: user.customerDbId,
      customer_name: user.customerName,
    });
  }
}
