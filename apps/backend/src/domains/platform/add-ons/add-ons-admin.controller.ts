import { Controller, Get, Post, Patch, Param, Body, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AddOnsService } from './add-ons.service';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { EnableAddOnDto } from './dto/enable-add-on.dto';
import { CancelAddOnDto } from './dto/cancel-add-on.dto';
import { UpdateAddOnDto } from './dto/update-add-on.dto';

@ApiTags('Add-ons (Admin)')
@Controller('admin/tenants/:tenantId/add-ons')
@Roles(UserRole.SUPER_ADMIN)
export class AddOnsAdminController {
  constructor(private readonly addOnsService: AddOnsService) {}

  /**
   * List a tenant's add-ons (SUPER_ADMIN only)
   */
  @ApiOperation({ summary: "List a tenant's add-on subscriptions" })
  @Get()
  async listTenantAddOns(@Param('tenantId', ParseIntPipe) tenantId: number) {
    return this.addOnsService.listTenantAddOns(tenantId);
  }

  /**
   * Activate an add-on for a tenant (SUPER_ADMIN only)
   */
  @ApiOperation({ summary: 'Enable an add-on for a tenant' })
  @Post(':slug/enable')
  async enableAddOn(
    @Param('tenantId', ParseIntPipe) tenantId: number,
    @Param('slug') slug: string,
    @Body() body: EnableAddOnDto,
    @CurrentUser() user: any,
  ) {
    return this.addOnsService.activateAddOn(tenantId, slug, 'admin', user.email ?? user.userId, body.priceCents);
  }

  /**
   * Cancel an add-on for a tenant (SUPER_ADMIN only)
   */
  @ApiOperation({ summary: 'Cancel an add-on for a tenant' })
  @Post(':slug/cancel')
  async cancelAddOn(
    @Param('tenantId', ParseIntPipe) tenantId: number,
    @Param('slug') slug: string,
    @Body() body: CancelAddOnDto,
    @CurrentUser() user: any,
  ) {
    return this.addOnsService.cancelAddOn(tenantId, slug, user.email ?? user.userId, body.reason);
  }
}

/**
 * Separate controller for add-on catalog admin operations (not tenant-scoped)
 */
@ApiTags('Add-ons Catalog (Admin)')
@Controller('admin/add-ons')
@Roles(UserRole.SUPER_ADMIN)
export class AddOnsCatalogAdminController {
  constructor(private readonly addOnsService: AddOnsService) {}

  /**
   * List full add-on catalog with all fields including providerPriceId (SUPER_ADMIN only)
   */
  @ApiOperation({ summary: 'List full add-on catalog (admin)' })
  @Get()
  async listCatalog() {
    return this.addOnsService.listAllAddOns();
  }

  /**
   * Update providerPriceId on an add-on (SUPER_ADMIN only)
   */
  @ApiOperation({ summary: 'Update provider price ID for an add-on' })
  @Patch(':slug/provider-price')
  async updateProviderPrice(@Param('slug') slug: string, @Body() body: { providerPriceId: string | null }) {
    return this.addOnsService.updateProviderPriceId(slug, body.providerPriceId);
  }

  /**
   * Update an add-on catalog entry (SUPER_ADMIN only)
   */
  @ApiOperation({ summary: 'Update add-on catalog entry' })
  @Patch(':slug')
  async updateAddOn(@Param('slug') slug: string, @Body() body: UpdateAddOnDto) {
    return this.addOnsService.updateAddOn(slug, body);
  }
}
