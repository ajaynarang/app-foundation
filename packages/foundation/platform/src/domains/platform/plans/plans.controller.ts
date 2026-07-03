import { Controller, Get, Patch, Param, Body, BadRequestException } from '@nestjs/common';
import { PlansService } from './plans.service';
import { Public } from '../../../auth/decorators/public.decorator';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { UserRole, TenantPlan } from '@appshore/db';
import { UpdatePlanConfigDto } from './dto/update-plan-config.dto';
import { ToggleEntitlementDto } from './dto/toggle-entitlement.dto';

@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  /**
   * Get all active plan configurations (public - for marketing/pricing page)
   */
  @Public()
  @Get()
  async getAllPlans() {
    return this.plansService.getAllPlanConfigs();
  }

  /**
   * Get the current authenticated tenant's plan details
   */
  @Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
  @Get('my-plan')
  async getMyPlan(@CurrentUser() user: any) {
    if (!user?.tenantId) {
      throw new BadRequestException('This endpoint requires a tenant context');
    }
    return this.plansService.getTenantPlanDetails(user.tenantId);
  }

  /**
   * Get a specific tenant's plan details (SUPER_ADMIN only)
   */
  @Roles(UserRole.SUPER_ADMIN)
  @Get('tenant/:tenantId')
  async getTenantPlan(@Param('tenantId') tenantId: string) {
    return this.plansService.getTenantPlanDetails(tenantId);
  }

  /**
   * Assign a plan to a tenant (SUPER_ADMIN only)
   */
  @Roles(UserRole.SUPER_ADMIN)
  @Patch('tenant/:tenantId')
  async assignPlan(
    @Param('tenantId') tenantId: string,
    @Body() body: { plan: TenantPlan; reason?: string },
    @CurrentUser() user: any,
  ) {
    return this.plansService.assignPlan(tenantId, body.plan, user.email ?? user.userId, body.reason);
  }

  /**
   * Update providerPriceId on a PlanConfig (SUPER_ADMIN only)
   */
  @Roles(UserRole.SUPER_ADMIN)
  @Patch(':plan/provider-price')
  async updateProviderPrice(@Param('plan') plan: TenantPlan, @Body() body: { providerPriceId: string | null }) {
    return this.plansService.updateProviderPriceId(plan, body.providerPriceId);
  }

  /**
   * Update a plan config (SUPER_ADMIN only)
   */
  @Roles(UserRole.SUPER_ADMIN)
  @Patch(':plan')
  async updatePlanConfig(@Param('plan') plan: TenantPlan, @Body() body: UpdatePlanConfigDto) {
    return this.plansService.updatePlanConfig(plan, body);
  }

  /**
   * Toggle an individual entitlement for a plan (SUPER_ADMIN only)
   */
  @Roles(UserRole.SUPER_ADMIN)
  @Patch(':plan/entitlements/:feature')
  async toggleEntitlement(
    @Param('plan') plan: TenantPlan,
    @Param('feature') feature: string,
    @Body() body: ToggleEntitlementDto,
  ) {
    return this.plansService.toggleEntitlement(plan, feature, body.enabled);
  }
}
