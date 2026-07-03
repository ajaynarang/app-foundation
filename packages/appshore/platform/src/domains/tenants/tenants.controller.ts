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
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { RegisterTenantDto } from './dto/register-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { SuspendTenantDto } from './dto/suspend-tenant.dto';
import { UpdateOrganizationProfileDto } from './dto/update-organization-profile.dto';
import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '@appshore/db';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { BaseTenantController } from '../../shared/base/base-tenant.controller';
import { PrismaService } from '../../infrastructure/database/prisma.service';

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
  async getMyOrganizationProfile(@CurrentUser() user: any) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.tenantsService.getMyOrganizationProfile(tenantDbId);
  }

  @Patch('me')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Update the current tenant company profile (ADMIN/OWNER only)' })
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
  async register(@Body() dto: RegisterTenantDto) {
    this.assertMultiTenant();
    // Verify Turnstile token if configured
    if (process.env.TURNSTILE_SECRET_KEY) {
      if (!dto.turnstileToken) {
        throw new BadRequestException('Bot verification required. Please try again.');
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
          throw new BadRequestException('Bot verification failed. Please try again.');
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
  async checkSubdomain(@Param('subdomain') subdomain: string) {
    this.assertMultiTenant();
    const available = await this.tenantsService.checkSubdomainAvailability(subdomain);
    return { available };
  }

  @Public()
  @Get('branding/:subdomain')
  async getTenantBranding(@Param('subdomain') subdomain: string) {
    this.assertMultiTenant();
    return this.tenantsService.getTenantBranding(subdomain);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Get()
  async getAllTenants(@Query('status') status?: string) {
    return this.tenantsService.getAllTenants(status);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Post(':tenantId/approve')
  async approveTenant(@Param('tenantId') tenantId: string, @CurrentUser() user: any) {
    return this.tenantsService.approveTenant(tenantId, user.email);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Post(':tenantId/reject')
  async rejectTenant(@Param('tenantId') tenantId: string, @Body('reason') reason: string) {
    return this.tenantsService.rejectTenant(tenantId, reason);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Post(':tenantId/suspend')
  async suspendTenant(@Param('tenantId') tenantId: string, @Body() dto: SuspendTenantDto, @CurrentUser() user: any) {
    return this.tenantsService.suspendTenant(tenantId, dto.reason, user.email);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Post(':tenantId/reactivate')
  async reactivateTenant(@Param('tenantId') tenantId: string, @CurrentUser() user: any) {
    return this.tenantsService.reactivateTenant(tenantId, user.email);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Patch(':tenantId')
  async updateTenant(@Param('tenantId') tenantId: string, @Body() dto: UpdateTenantDto) {
    return this.tenantsService.updateTenant(tenantId, dto);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Get(':tenantId/details')
  async getTenantDetails(@Param('tenantId') tenantId: string) {
    return this.tenantsService.getTenantDetails(tenantId);
  }
}
