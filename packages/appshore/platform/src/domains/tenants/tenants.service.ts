import * as bcrypt from 'bcrypt';
import {
  Inject,
  Injectable,
  Logger,
  Optional,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AppCacheService } from '../../infrastructure/cache/app-cache.service';
import { buildKey } from '@appshore/kernel/infrastructure/cache/cache-key.constants';
import { CACHE_TTL_WARM_5M } from '@appshore/kernel/constants/cache.constants';
import { RegisterTenantDto } from './dto/register-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { generateId } from '@appshore/kernel/shared/utils/id-generator';
import { generateUuidV7 } from '@appshore/kernel/shared/utils/uuidv7';
import { Prisma, TenantPlan, TenantStatus } from '@appshore/db';
import {
  DEFAULT_TENANT_TIMEZONE,
  type OrganizationProfile,
  type UpdateOrganizationProfileInput,
} from '@app/shared-types';
import { NotificationService } from '../../infrastructure/notification/notification.service';
import { TENANT_PROVISION_HOOKS, type TenantProvisionHooks } from '../platform-hooks';

/** Prisma select for the editable organization-profile field set. */
const ORGANIZATION_PROFILE_SELECT = {
  companyName: true,
  contactEmail: true,
  contactPhone: true,
  timezone: true,
} satisfies Prisma.TenantSelect;

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
    private readonly cache: AppCacheService,
    @Optional() @Inject(TENANT_PROVISION_HOOKS) private readonly provisionHooks?: TenantProvisionHooks,
  ) {}

  /**
   * Check if subdomain is available
   */
  async checkSubdomainAvailability(subdomain: string): Promise<boolean> {
    const reservedSubdomains = ['admin', 'api', 'www', 'app', 'dashboard', 'mail', 'support', 'help', 'docs'];

    if (reservedSubdomains.includes(subdomain.toLowerCase())) {
      return false;
    }

    const existing = await this.prisma.tenant.findUnique({
      where: { subdomain: subdomain.toLowerCase() },
    });

    return !existing;
  }

  /**
   * Get public branding info for a tenant by subdomain.
   * Returns only non-sensitive data safe for the login page.
   * Returns null if the tenant doesn't exist or isn't active.
   */
  async getTenantBranding(subdomain: string): Promise<{ companyName: string; logoUrl: string | null } | null> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { subdomain: subdomain.toLowerCase() },
      select: {
        companyName: true,
        status: true,
      },
    });

    if (!tenant || tenant.status !== 'ACTIVE') return null;

    return {
      companyName: tenant.companyName,
      logoUrl: null,
    };
  }

  /**
   * Register new tenant with admin user.
   * Sets up a 30-day free trial and records the plan event.
   */
  async registerTenant(dto: RegisterTenantDto) {
    // Check subdomain availability
    const isAvailable = await this.checkSubdomainAvailability(dto.subdomain);
    if (!isAvailable) {
      throw new ConflictException('Subdomain is already taken or reserved');
    }

    if (!dto.password && !dto.firebaseUid) {
      throw new BadRequestException('A password (or Firebase account) is required');
    }

    // Check if email already registered (across all tenants)
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: dto.email }, ...(dto.firebaseUid ? [{ firebaseUid: dto.firebaseUid }] : [])],
      },
    });

    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
    const passwordHash = dto.password ? await bcrypt.hash(dto.password, 12) : undefined;

    // Create tenant and admin user in transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Create tenant with trial plan
      const tenant = await tx.tenant.create({
        data: {
          tenantId: generateId('tenant'),
          companyName: dto.companyName,
          subdomain: dto.subdomain.toLowerCase(),
          contactEmail: dto.email,
          contactPhone: dto.phone,
          status: 'PENDING_APPROVAL',
          isActive: false,
          plan: TenantPlan.TRIAL,
          trialStartedAt: now,
          trialEndsAt,
        },
      });

      // Create owner user (cannot be deleted)
      const ownerUser = await tx.user.create({
        data: {
          userId: generateId('user'),
          tenantId: tenant.id,
          email: dto.email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: 'OWNER', // Owner role - created during registration, cannot be deleted
          firebaseUid: dto.firebaseUid ?? null,
          passwordHash,
          emailVerified: false,
          isActive: false, // Inactive until tenant approved
        },
      });

      // Record the trial plan event for audit trail
      await tx.tenantPlanEvent.create({
        data: {
          id: generateUuidV7(),
          tenantId: tenant.id,
          fromPlan: null,
          toPlan: TenantPlan.TRIAL,
          changedBy: 'system-registration',
          reason: '30-day free trial started on registration',
        },
      });

      return { tenant, ownerUser };
    });

    await this.invalidateTenantCache();

    // Send registration confirmation email
    await this.notificationService.sendTenantRegistrationConfirmation(
      result.tenant.tenantId,
      dto.email,
      dto.firstName,
      result.tenant.companyName,
    );

    return {
      tenantId: result.tenant.tenantId,
      status: result.tenant.status,
      message: 'Registration successful! Your account is pending approval.',
    };
  }

  /**
   * Get all tenants (SUPER_ADMIN only)
   */
  async getAllTenants(status?: string) {
    const cacheKey = buildKey('app:tenants', 'list', status || 'all');
    return this.cache.getOrSet(
      cacheKey,
      () =>
        this.prisma.tenant.findMany({
          where: status ? { status: status as TenantStatus } : undefined,
          include: {
            users: {
              where: { role: { in: ['OWNER', 'ADMIN'] } },
              select: {
                userId: true,
                email: true,
                firstName: true,
                lastName: true,
                role: true,
              },
            },
            _count: {
              select: {
                users: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
      CACHE_TTL_WARM_5M,
    );
  }

  /**
   * Approve tenant
   */
  async approveTenant(tenantId: string, approvedBy: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { tenantId },
      include: { users: { where: { role: { in: ['OWNER', 'ADMIN'] } } } },
    });

    if (!tenant) {
      throw new BadRequestException('Tenant not found');
    }

    if (tenant.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException('Tenant is not pending approval');
    }

    // Update tenant and activate admin user
    const result = await this.prisma.$transaction(async (tx) => {
      const updatedTenant = await tx.tenant.update({
        where: { tenantId },
        data: {
          status: 'ACTIVE',
          isActive: true,
          approvedAt: new Date(),
          approvedBy,
        },
      });

      // Activate owner and admin user(s)
      await tx.user.updateMany({
        where: {
          tenantId: tenant.id,
          role: { in: ['OWNER', 'ADMIN'] },
        },
        data: {
          isActive: true,
        },
      });

      // Create default user preferences for the owner
      const ownerUser = await tx.user.findFirst({
        where: { tenantId: tenant.id, role: 'OWNER' },
      });
      if (ownerUser) {
        await tx.userPreferences.upsert({
          where: { userId: ownerUser.id },
          create: { userId: ownerUser.id },
          update: {},
        });
      }

      return updatedTenant;
    });

    await this.invalidateTenantCache(tenantId);

    // Provision app-side resources for the freshly-approved tenant (the
    // template binds this to Desk bootstrap — see platform-glue/hooks.module).
    await this.provisionHooks?.tenantApproved(tenant.id);

    // Send approval email to owner
    const ownerUser = tenant.users.find((u) => u.role === 'OWNER');
    if (ownerUser) {
      await this.notificationService.sendTenantApprovalNotification(
        tenantId,
        ownerUser.email,
        ownerUser.firstName,
        result.companyName,
        result.subdomain || tenantId,
      );
    }

    return result;
  }

  /**
   * Reject tenant
   */
  async rejectTenant(tenantId: string, reason: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { tenantId },
      include: {
        users: {
          where: { role: 'OWNER' },
        },
      },
    });

    if (!tenant) {
      throw new BadRequestException('Tenant not found');
    }

    const result = await this.prisma.tenant.update({
      where: { tenantId },
      data: {
        status: 'REJECTED',
        rejectedAt: new Date(),
        rejectionReason: reason,
      },
    });

    await this.invalidateTenantCache(tenantId);

    // Send rejection email to owner
    const ownerUser = tenant.users?.find((u) => u.role === 'OWNER');
    if (ownerUser) {
      await this.notificationService.sendTenantRejectionNotification(
        tenantId,
        ownerUser.email,
        ownerUser.firstName,
        tenant.companyName,
        reason,
      );
    }

    return result;
  }

  /**
   * Suspend tenant
   */
  async suspendTenant(tenantId: string, reason: string, suspendedBy: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { tenantId },
      include: { users: { where: { role: 'OWNER' } } },
    });

    if (!tenant) {
      throw new BadRequestException('Tenant not found');
    }

    if (tenant.status !== 'ACTIVE') {
      throw new BadRequestException('Can only suspend ACTIVE tenants');
    }

    if (!reason || reason.trim().length < 10) {
      throw new BadRequestException('Suspension reason must be at least 10 characters');
    }

    // Update tenant and deactivate all users in transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const updatedTenant = await tx.tenant.update({
        where: { tenantId },
        data: {
          status: 'SUSPENDED',
          isActive: false,
          suspendedAt: new Date(),
          suspendedBy,
          suspensionReason: reason,
        },
      });

      // Deactivate all tenant users (logs them out)
      await tx.user.updateMany({
        where: { tenantId: tenant.id },
        data: { isActive: false },
      });

      return updatedTenant;
    });

    await this.invalidateTenantCache(tenantId);

    // Send suspension notification email
    const ownerUser = tenant.users.find((u) => u.role === 'OWNER');
    if (ownerUser) {
      await this.notificationService.sendTenantSuspensionNotification(
        tenantId,
        ownerUser.email,
        ownerUser.firstName,
        result.companyName,
        reason,
      );
    }

    return result;
  }

  /**
   * Reactivate tenant
   */
  async reactivateTenant(tenantId: string, reactivatedBy: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { tenantId },
      include: { users: { where: { role: 'OWNER' } } },
    });

    if (!tenant) {
      throw new BadRequestException('Tenant not found');
    }

    if (tenant.status !== 'SUSPENDED') {
      throw new BadRequestException('Can only reactivate SUSPENDED tenants');
    }

    // Update tenant and reactivate all users in transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const updatedTenant = await tx.tenant.update({
        where: { tenantId },
        data: {
          status: 'ACTIVE',
          isActive: true,
          reactivatedAt: new Date(),
          reactivatedBy,
        },
      });

      // Reactivate all tenant users
      await tx.user.updateMany({
        where: { tenantId: tenant.id },
        data: { isActive: true },
      });

      return updatedTenant;
    });

    await this.invalidateTenantCache(tenantId);

    // Send reactivation notification email
    const ownerUser = tenant.users.find((u) => u.role === 'OWNER');
    if (ownerUser) {
      await this.notificationService.sendTenantReactivationNotification(
        tenantId,
        ownerUser.email,
        ownerUser.firstName,
        result.companyName,
      );
    }

    return result;
  }

  /**
   * Update tenant details (SUPER_ADMIN only)
   */
  async updateTenant(tenantId: string, dto: UpdateTenantDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { tenantId },
      include: { users: { where: { role: 'OWNER' } } },
    });

    if (!tenant) {
      throw new BadRequestException('Tenant not found');
    }

    // If subdomain is being changed, check availability
    if (dto.subdomain && dto.subdomain !== tenant.subdomain) {
      const isAvailable = await this.checkSubdomainAvailability(dto.subdomain);
      if (!isAvailable) {
        throw new ConflictException('Subdomain is already taken or reserved');
      }
    }

    // Build tenant update data (only include provided fields)
    const tenantUpdate: any = {};
    if (dto.companyName !== undefined) tenantUpdate.companyName = dto.companyName;
    if (dto.subdomain !== undefined) tenantUpdate.subdomain = dto.subdomain.toLowerCase();

    // Build owner user update data
    const ownerUpdate: any = {};
    if (dto.ownerFirstName !== undefined) ownerUpdate.firstName = dto.ownerFirstName;
    if (dto.ownerLastName !== undefined) ownerUpdate.lastName = dto.ownerLastName;
    if (dto.ownerEmail !== undefined) {
      ownerUpdate.email = dto.ownerEmail;
      tenantUpdate.contactEmail = dto.ownerEmail;
    }
    if (dto.ownerPhone !== undefined) {
      tenantUpdate.contactPhone = dto.ownerPhone;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedTenant = await tx.tenant.update({
        where: { tenantId },
        data: tenantUpdate,
      });

      // Update owner user if any owner fields provided
      const ownerUser = tenant.users.find((u) => u.role === 'OWNER');
      if (ownerUser && Object.keys(ownerUpdate).length > 0) {
        await tx.user.update({
          where: { id: ownerUser.id },
          data: ownerUpdate,
        });
      }

      return updatedTenant;
    });

    await this.invalidateTenantCache(tenantId);

    return result;
  }

  /**
   * Get tenant details with users and metrics
   */
  async getTenantDetails(tenantId: string) {
    const cacheKey = buildKey('app:tenants', 'detail', tenantId);
    return this.cache.getOrSet(cacheKey, () => this.fetchTenantDetails(tenantId), CACHE_TTL_WARM_5M);
  }

  private async fetchTenantDetails(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { tenantId },
      include: {
        users: {
          select: {
            userId: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            isActive: true,
            lastLoginAt: true,
          },
          orderBy: [{ role: 'asc' }, { firstName: 'asc' }],
        },
        _count: {
          select: {
            users: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new BadRequestException('Tenant not found');
    }

    return {
      tenant: {
        id: tenant.id,
        tenantId: tenant.tenantId,
        companyName: tenant.companyName,
        subdomain: tenant.subdomain,
        status: tenant.status,
        contactEmail: tenant.contactEmail,
        contactPhone: tenant.contactPhone,
        createdAt: tenant.createdAt.toISOString(),
        approvedAt: tenant.approvedAt?.toISOString(),
        approvedBy: tenant.approvedBy,
        rejectedAt: tenant.rejectedAt?.toISOString(),
        rejectionReason: tenant.rejectionReason,
        suspendedAt: tenant.suspendedAt?.toISOString(),
        suspendedBy: tenant.suspendedBy,
        suspensionReason: tenant.suspensionReason,
        reactivatedAt: tenant.reactivatedAt?.toISOString(),
        reactivatedBy: tenant.reactivatedBy,
      },
      users: tenant.users,
      metrics: {
        totalUsers: tenant._count.users,
      },
    };
  }

  /**
   * Self-service company-profile read for the Organization settings page.
   * Returns the editable field set with a concrete timezone (defaulting to
   * `DEFAULT_TENANT_TIMEZONE` when the tenant has none). Keyed by numeric
   * `tenantDbId` — the `me/*` controller resolves it from the JWT.
   */
  async getMyOrganizationProfile(tenantDbId: number): Promise<OrganizationProfile> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantDbId },
      select: ORGANIZATION_PROFILE_SELECT,
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return this.toOrganizationProfile(tenant);
  }

  /**
   * Self-service company-profile edit (OWNER/ADMIN) via `PATCH /tenants/me`.
   *
   * Maps ONLY the editable profile fields and writes the TENANT contact
   * directly — it never rewrites the owner User login email (that's the
   * super-admin `updateTenant` path's concern). Lifecycle/billing fields are
   * not editable here. Invalidates the `me-settings` cache so the dispatcher
   * settings surfaces pick up the change.
   */
  async updateMyOrganizationProfile(
    tenantDbId: number,
    dto: UpdateOrganizationProfileInput,
  ): Promise<OrganizationProfile> {
    const data: Prisma.TenantUpdateInput = {};
    if (dto.companyName !== undefined) data.companyName = dto.companyName;
    if (dto.contactEmail !== undefined) data.contactEmail = dto.contactEmail;
    if (dto.contactPhone !== undefined) data.contactPhone = dto.contactPhone;
    if (dto.timezone !== undefined) data.timezone = dto.timezone;

    let tenant;
    try {
      tenant = await this.prisma.tenant.update({
        where: { id: tenantDbId },
        data,
        select: ORGANIZATION_PROFILE_SELECT,
      });
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === 'P2025') {
        throw new NotFoundException('Tenant not found');
      }
      throw err;
    }

    await this.invalidateTenantSettingsCache(tenantDbId);
    return this.toOrganizationProfile(tenant);
  }

  private toOrganizationProfile(tenant: {
    companyName: string;
    contactEmail: string | null;
    contactPhone: string | null;
    timezone: string | null;
  }): OrganizationProfile {
    return {
      companyName: tenant.companyName,
      contactEmail: tenant.contactEmail,
      contactPhone: tenant.contactPhone,
      timezone: tenant.timezone ?? DEFAULT_TENANT_TIMEZONE,
    };
  }

  private async invalidateTenantSettingsCache(tenantDbId: number): Promise<void> {
    await this.cache.del(buildKey('app:tenants', 'me-settings', tenantDbId));
  }

  /** Invalidate all tenant-related caches after a mutation. */
  private async invalidateTenantCache(tenantId?: string): Promise<void> {
    const keys = [
      buildKey('app:tenants', 'list', 'all'),
      buildKey('app:tenants', 'list', 'ACTIVE'),
      buildKey('app:tenants', 'list', 'PENDING_APPROVAL'),
      buildKey('app:tenants', 'list', 'SUSPENDED'),
      buildKey('app:tenants', 'list', 'REJECTED'),
    ];
    if (tenantId) {
      keys.push(buildKey('app:tenants', 'detail', tenantId));
    }
    await Promise.allSettled(keys.map((k) => this.cache.del(k)));
  }
}
