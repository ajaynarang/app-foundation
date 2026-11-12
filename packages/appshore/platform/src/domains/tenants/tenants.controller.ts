import {
  Controller,
  Logger,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  BadRequestException,
  NotFoundException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { RegisterTenantDto } from './dto/register-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { SuspendTenantDto } from './dto/suspend-tenant.dto';
import { UpdateOrganizationProfileDto } from './dto/update-organization-profile.dto';
import { RejectTenantDto } from './dto/reject-tenant.dto';
import { TenantListQueryDto } from './dto/tenant-list-query.dto';
import { fieldError } from '@appshore/kernel/shared/errors/api-errors';
import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '@appshore/db';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { BaseTenantController } from '../../shared/base/base-tenant.controller';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { ApiResult } from '../../shared/openapi/api-result';
import {
  OrganizationProfileResponse,
  SubdomainAvailabilityResponse,
  TenantAdminDetailsResponse,
  TenantAdminListResponseRef,
  TenantBrandingResponse,
  TenantRecordResponse,
  TenantRegistrationResultResponse,
} from './openapi.responses';

@ApiTags('Tenants')
@ApiBearerAuth()
@Controller('tenants')
export class TenantsController extends BaseTenantController {
  private readonly logger = new Logger(TenantsController.name);

  constructor(
    prisma: PrismaService,
    private readonly tenantsService: TenantsService,
    private readonly configService: ConfigService,
  ) {
    super(prisma);
  }

  // ── Current-tenant settings (ADMIN + OWNER) ──────────────────────────
  // Defined before the parameterised routes so the path matcher prefers them.

  @Get('me/profile')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get the current tenant company profile (ADMIN/OWNER only)' })
  @ApiResult(OrganizationProfileResponse)
  async getMyOrganizationProfile(@CurrentUser() user: any) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.tenantsService.getMyOrganizationProfile(tenantDbId);
  }

  @Patch('me')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Update the current tenant company profile (ADMIN/OWNER only)' })
  @ApiResult(OrganizationProfileResponse)
  async updateMyOrganizationProfile(@CurrentUser() user: any, @Body() dto: UpdateOrganizationProfileDto) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.tenantsService.updateMyOrganizationProfile(tenantDbId, dto);
  }

  /** MT-only public endpoints 404 in single-tenant mode (parity with the hidden UI). */
  private assertMultiTenant(): void {
    if (this.configService.get<string>('multiTenancy.mode') !== 'multi') {
      throw new NotFoundException();
    }
  }

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Register a new tenant with its owner — public, multi-tenant mode only; starts a 30-day trial pending approval',
  })
  @ApiResult(TenantRegistrationResultResponse, HttpStatus.CREATED)
  async register(@Body() dto: RegisterTenantDto) {
    this.assertMultiTenant();
    // Verify Turnstile token if configured
    if (process.env.TURNSTILE_SECRET_KEY) {
      if (!dto.turnstileToken) {
        throw fieldError('turnstileToken', 'Bot verification required. Please try again.');
      }
      try {
        const verifyResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            secret: process.env.TURNSTILE_SECRET_KEY,
            response: dto.turnstileToken,
          }),
        });
        const result = await verifyResponse.json();
        if (!result.success) {
          throw fieldError('turnstileToken', 'Bot verification failed. Please try again.');
        }
      } catch (error) {
        // If it's our own BadRequestException, re-throw it
        if (error instanceof BadRequestException) {
          throw error;
        }
        // Cloudflare is unreachable — fail open, log warning
        this.logger.warn(
          `[Turnstile] Verification failed due to network error, allowing registration: ${error?.message || error}`,
        );
      }
    }
    return this.tenantsService.registerTenant(dto);
  }

  @Public()
  @Get('check-subdomain/:subdomain')
  @ApiOperation({
    summary: 'Check whether a subdomain is free (not taken or reserved) — public, multi-tenant mode only',
  })
  @ApiParam({ name: 'subdomain', description: 'Tenant subdomain (case-insensitive)' })
  @ApiResult(SubdomainAvailabilityResponse)
  async checkSubdomain(@Param('subdomain') subdomain: string) {
    this.assertMultiTenant();
    const available = await this.tenantsService.checkSubdomainAvailability(subdomain);
    return { available };
  }

  @Public()
  @Get('branding/:subdomain')
  @ApiOperation({
    summary:
      "A tenant's login-page branding — public, multi-tenant mode only; null when the tenant is unknown or not active",
  })
  @ApiParam({ name: 'subdomain', description: 'Tenant subdomain (case-insensitive)' })
  @ApiResult(TenantBrandingResponse)
  async getTenantBranding(@Param('subdomain') subdomain: string) {
    this.assertMultiTenant();
    return this.tenantsService.getTenantBranding(subdomain);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Get()
  @ApiOperation({
    summary: 'Every tenant, by company name: a cursor list; `q` searches, `status` filters (SUPER_ADMIN)',
  })
  @ApiResult(TenantAdminListResponseRef)
  async getAllTenants(@Query() query: TenantListQueryDto) {
    return this.tenantsService.listTenants(query);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Post(':tenant_id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve a pending tenant — activates it and its owner/admins (SUPER_ADMIN); 409 unless PENDING_APPROVAL',
  })
  @ApiParam({ name: 'tenant_id', description: 'Tenant public id (tenant_…)' })
  @ApiResult(TenantRecordResponse)
  async approveTenant(@Param('tenant_id') tenantId: string, @CurrentUser() user: any) {
    return this.tenantsService.approveTenant(tenantId, user.email);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Post(':tenant_id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a tenant registration with a reason (SUPER_ADMIN)' })
  @ApiParam({ name: 'tenant_id', description: 'Tenant public id (tenant_…)' })
  @ApiResult(TenantRecordResponse)
  async rejectTenant(@Param('tenant_id') tenantId: string, @Body() dto: RejectTenantDto) {
    return this.tenantsService.rejectTenant(tenantId, dto.reason);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Post(':tenant_id/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Suspend an active tenant and deactivate its users (SUPER_ADMIN); 409 unless ACTIVE',
  })
  @ApiParam({ name: 'tenant_id', description: 'Tenant public id (tenant_…)' })
  @ApiResult(TenantRecordResponse)
  async suspendTenant(@Param('tenant_id') tenantId: string, @Body() dto: SuspendTenantDto, @CurrentUser() user: any) {
    return this.tenantsService.suspendTenant(tenantId, dto.reason, user.email);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Post(':tenant_id/reactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reactivate a suspended tenant and its users (SUPER_ADMIN); 409 unless SUSPENDED',
  })
  @ApiParam({ name: 'tenant_id', description: 'Tenant public id (tenant_…)' })
  @ApiResult(TenantRecordResponse)
  async reactivateTenant(@Param('tenant_id') tenantId: string, @CurrentUser() user: any) {
    return this.tenantsService.reactivateTenant(tenantId, user.email);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Patch(':tenant_id')
  @ApiOperation({ summary: "Update a tenant's company, subdomain and owner details (SUPER_ADMIN)" })
  @ApiParam({ name: 'tenant_id', description: 'Tenant public id (tenant_…)' })
  @ApiResult(TenantRecordResponse)
  async updateTenant(@Param('tenant_id') tenantId: string, @Body() dto: UpdateTenantDto) {
    return this.tenantsService.updateTenant(tenantId, dto);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Get(':tenant_id/details')
  @ApiOperation({ summary: 'A tenant with its lifecycle, users and metrics (SUPER_ADMIN)' })
  @ApiParam({ name: 'tenant_id', description: 'Tenant public id (tenant_…)' })
  @ApiResult(TenantAdminDetailsResponse)
  async getTenantDetails(@Param('tenant_id') tenantId: string) {
    return this.tenantsService.getTenantDetails(tenantId);
  }
}
