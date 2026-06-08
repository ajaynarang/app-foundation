import { Controller, Get, Post, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AddOnRequestStatusEnum } from '@sally/shared-types';
import { AddOnsService } from './add-ons.service';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { ApproveRequestDto } from './dto/approve-request.dto';
import { DeclineRequestDto } from './dto/decline-request.dto';
import { CancelAddOnDto } from './dto/cancel-add-on.dto';

@ApiTags('Add-on Requests (Admin)')
@Controller('admin/add-on-requests')
@Roles(UserRole.SUPER_ADMIN)
export class AddOnsRequestAdminController {
  constructor(private readonly addOnsService: AddOnsService) {}

  /**
   * List add-on requests with optional status filter (SUPER_ADMIN only)
   */
  @ApiOperation({ summary: 'List add-on requests' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: AddOnRequestStatusEnum.options,
  })
  @Get()
  async listRequests(@Query('status') status?: string) {
    return this.addOnsService.listRequests(status as 'PENDING' | 'APPROVED' | 'DECLINED' | undefined);
  }

  /**
   * Approve an add-on request (SUPER_ADMIN only)
   */
  @ApiOperation({ summary: 'Approve an add-on request' })
  @Post(':id/approve')
  async approveRequest(@Param('id') id: string, @Body() body: ApproveRequestDto, @CurrentUser() user: any) {
    return this.addOnsService.approveRequest(id, user.dbId, body.giftedPriceCents);
  }

  /**
   * Decline an add-on request (SUPER_ADMIN only)
   */
  @ApiOperation({ summary: 'Decline an add-on request' })
  @Post(':id/decline')
  async declineRequest(@Param('id') id: string, @Body() body: DeclineRequestDto, @CurrentUser() user: any) {
    return this.addOnsService.declineRequest(id, user.dbId, body.reason);
  }

  /**
   * List a tenant's active add-ons (SUPER_ADMIN only)
   */
  @ApiOperation({ summary: "List a tenant's add-ons" })
  @Get('tenant/:tenantId/add-ons')
  async listTenantAddOns(@Param('tenantId') tenantId: string) {
    return this.addOnsService.listTenantAddOns(parseInt(tenantId, 10));
  }

  /**
   * Revoke/cancel an active add-on for a tenant (SUPER_ADMIN only)
   */
  @ApiOperation({ summary: 'Revoke an active add-on for a tenant' })
  @Post('tenant/:tenantId/add-ons/:slug/cancel')
  async cancelAddOn(
    @Param('tenantId') tenantId: string,
    @Param('slug') slug: string,
    @Body() body: CancelAddOnDto,
    @CurrentUser() user: any,
  ) {
    return this.addOnsService.cancelAddOn(parseInt(tenantId, 10), slug, user.dbId, body.reason);
  }

  /**
   * Directly activate an add-on for a tenant (gift/enable without request)
   */
  @ApiOperation({ summary: 'Directly activate an add-on for a tenant' })
  @Post('tenant/:tenantId/add-ons/:slug/activate')
  async activateAddOn(
    @Param('tenantId') tenantId: string,
    @Param('slug') slug: string,
    @Body() body: ApproveRequestDto,
    @CurrentUser() user: any,
  ) {
    return this.addOnsService.activateAddOn(
      parseInt(tenantId, 10),
      slug,
      body.giftedPriceCents !== undefined ? 'gifted' : 'purchased',
      user.dbId,
      body.giftedPriceCents,
    );
  }
}
