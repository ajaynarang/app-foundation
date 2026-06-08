import { Controller, Get, Post, Patch, Param, Body, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AddOnsService } from './add-ons.service';
import { Public } from '../../../auth/decorators/public.decorator';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { RequestAddOnDto } from './dto/request-add-on.dto';
import { ToggleOverageDto } from './dto/toggle-overage.dto';

@ApiTags('Add-ons')
@Controller('add-ons')
export class AddOnsController {
  constructor(private readonly addOnsService: AddOnsService) {}

  /**
   * Get all active add-ons with pricing (public - for pricing page)
   */
  @ApiOperation({ summary: 'List add-on catalog (public)' })
  @Public()
  @Get()
  async listAddOns() {
    return this.addOnsService.getAddOnsForPricingPage();
  }

  /**
   * List the current tenant's active add-ons
   */
  @ApiOperation({ summary: 'List current tenant add-on subscriptions' })
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @Get('my-add-ons')
  async getMyAddOns(@CurrentUser() user: any) {
    if (!user?.tenantDbId) {
      throw new BadRequestException('Tenant context required');
    }
    return this.addOnsService.listTenantAddOns(user.tenantDbId);
  }

  /**
   * List the current user's add-on requests
   */
  @ApiOperation({ summary: 'List my add-on requests' })
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @Get('my-requests')
  async getMyRequests(@CurrentUser() user: any) {
    if (!user?.tenantDbId) {
      throw new BadRequestException('Tenant context required');
    }
    return this.addOnsService.listMyRequests(user.tenantDbId);
  }

  /**
   * Check access + usage for a specific add-on (accepts slug or featureKey)
   */
  @ApiOperation({ summary: 'Check add-on access status for current tenant' })
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @Get(':slug/status')
  async getAddOnStatus(@Param('slug') slug: string, @CurrentUser() user: any) {
    if (!user?.tenantDbId) {
      throw new BadRequestException('Tenant context required');
    }
    return this.addOnsService.getAddOnStatus(user.tenantDbId, slug);
  }

  /**
   * Request an add-on (ADMIN or OWNER only — dispatchers cannot make financial requests)
   */
  @ApiOperation({ summary: 'Request an add-on for your tenant' })
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @Post(':slug/request')
  async requestAddOn(@Param('slug') slug: string, @Body() body: RequestAddOnDto, @CurrentUser() user: any) {
    if (!user?.tenantDbId || !user?.dbId) {
      throw new BadRequestException('Tenant context required');
    }
    return this.addOnsService.createRequest(user.tenantDbId, slug, user.dbId, body.note);
  }

  /**
   * Directly activate an add-on for the current tenant (ADMIN only).
   * Used when payment_system feature flag is ON — no admin approval needed.
   * When payment_system is OFF, use the request workflow instead.
   */
  @ApiOperation({ summary: 'Activate an add-on (self-service, payment mode)' })
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @Post(':slug/activate')
  async activateAddOn(@Param('slug') slug: string, @CurrentUser() user: any) {
    if (!user?.tenantDbId || !user?.dbId) {
      throw new BadRequestException('Tenant context required');
    }
    return this.addOnsService.activateAddOn(user.tenantDbId, slug, 'purchased', user.email ?? String(user.dbId));
  }

  /**
   * Toggle overage for an add-on (ADMIN/OWNER only)
   */
  @ApiOperation({ summary: 'Toggle overage for an add-on' })
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @Patch(':slug/overage')
  async toggleOverage(@Param('slug') slug: string, @Body() body: ToggleOverageDto, @CurrentUser() user: any) {
    if (!user?.tenantDbId) {
      throw new BadRequestException('Tenant context required');
    }
    return this.addOnsService.toggleOverage(user.tenantDbId, slug, body.enabled, user.email ?? String(user.dbId));
  }

  /**
   * Cancel an active add-on (ADMIN/OWNER only)
   */
  @ApiOperation({ summary: 'Cancel an active add-on for your tenant' })
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @Post(':slug/cancel')
  async cancelAddOn(@Param('slug') slug: string, @CurrentUser() user: any) {
    if (!user?.tenantDbId || !user?.dbId) {
      throw new BadRequestException('Tenant context required');
    }
    return this.addOnsService.cancelAddOn(user.tenantDbId, slug, user.dbId);
  }
}
