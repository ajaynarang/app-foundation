import { Controller, Get, Patch, Param, Body, ForbiddenException } from '@nestjs/common';
import { PlansService } from './plans.service';
import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UserRole, TenantPlan } from '@appshore/db';
import { UpdatePlanConfigDto } from './dto/update-plan-config.dto';
import { ToggleEntitlementDto } from './dto/toggle-entitlement.dto';
import { AssignTenantPlanDto, UpdateProviderPriceDto } from './dto/assign-plan.dto';

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
      // No field of the request is at fault: the caller has no workspace (a super admin). 403 with the code
      // the plan guard already answers for the same condition.
      throw new ForbiddenException({ code: 'NO_TENANT', message: 'Open a workspace to see its plan' });
    }
    return this.plansService.getTenantPlanDetails(user.tenantId);
  }

  /**
   * Get a specific tenant's plan details (SUPER_ADMIN only)
   */
  @Roles(UserRole.SUPER_ADMIN)
  @Get('tenant/:tenant_id')
  async getTenantPlan(@Param('tenant_id') tenantId: string) {
    return this.plansService.getTenantPlanDetails(tenantId);
  }

  /**
   * Assign a plan to a tenant (SUPER_ADMIN only)
   */
  @Roles(UserRole.SUPER_ADMIN)
  @Patch('tenant/:tenant_id')
  async assignPlan(@Param('tenant_id') tenantId: string, @Body() body: AssignTenantPlanDto, @CurrentUser() user: any) {
    return this.plansService.assignPlan(tenantId, body.plan, user.email ?? user.userId, body.reason);
  }

  /**
   * Update providerPriceId on a PlanConfig (SUPER_ADMIN only)
   */
  @Roles(UserRole.SUPER_ADMIN)
  @Patch(':plan/provider-price')
  async updateProviderPrice(@Param('plan') plan: TenantPlan, @Body() body: UpdateProviderPriceDto) {
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
