import { Controller, Get, Logger, UseGuards } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/guards/tenant.guard';
import { RolesGuard } from '../../../auth/guards/roles.guard';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { TenantDbId } from '../../../auth/decorators/tenant-db-id.decorator';
import { OnboardingStatusResponse } from './dto/onboarding-status.dto';
import { AppCacheService } from '../../../infrastructure/cache/app-cache.service';
import { buildKey } from '../../../infrastructure/cache/cache-key.constants';
import { CACHE_TTL_HOT_30S } from '../../../constants/cache.constants';

@Controller('onboarding')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class OnboardingController {
  private readonly logger = new Logger(OnboardingController.name);

  constructor(
    private readonly onboardingService: OnboardingService,
    private readonly cache: AppCacheService,
  ) {}

  @Get('status')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async getOnboardingStatus(@TenantDbId() tenantDbId: number): Promise<OnboardingStatusResponse> {
    this.logger.log(`GET /onboarding/status for tenant DB ID ${tenantDbId}`);

    const cacheKey = buildKey('app:onboarding', 'status', 'tenant', tenantDbId);
    return this.cache.getOrSet(
      cacheKey,
      () => this.onboardingService.getOnboardingStatus(tenantDbId),
      CACHE_TTL_HOT_30S,
    );
  }
}
