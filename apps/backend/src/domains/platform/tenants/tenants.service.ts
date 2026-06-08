import { Injectable, Logger, ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { AppCacheService } from '../../../infrastructure/cache/app-cache.service';
import { buildKey } from '../../../infrastructure/cache/cache-key.constants';
import { CACHE_TTL_WARM_5M } from '../../../constants/cache.constants';
import { RegisterTenantDto } from './dto/register-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { generateId } from '../../../shared/utils/id-generator';
import { generateUuidV7 } from '../../../shared/utils/uuidv7';
import {
  BundleFormat,
  CarrierType,
  DriverPayTiming,
  FleetSize,
  Prisma,
  TenantPlan,
  TenantStatus,
} from '@prisma/client';
import {
  BundleFormatSchema,
  DEFAULT_TENANT_TIMEZONE,
  DriverPayTimingSchema,
  type BundleFormat as BundleFormatType,
  type DriverPayTiming as DriverPayTimingType,
  type OrganizationProfile,
  type UpdateOrganizationProfileInput,
} from '@app/shared-types';
import { NotificationService } from '../../../infrastructure/notification/notification.service';
import { DeskBootstrapService } from '../../desk/responsibilities/desk-bootstrap.service';
import { DomainEventService } from '../../../infrastructure/events/domain-event.service';
import { DOMAIN_EVENTS } from '../../../infrastructure/events/sally-events.constants';

/** Prisma select for the editable organization-profile field set. */
const ORGANIZATION_PROFILE_SELECT = {
  companyName: true,
  contactEmail: true,
  contactPhone: true,
  dotNumber: true,
  mcNumber: true,
  carrierType: true,
  fleetSize: true,
  timezone: true,
} satisfies Prisma.TenantSelect;

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
    private readonly cache: AppCacheService,
    private readonly deskBootstrap: DeskBootstrapService,
    private readonly events: DomainEventService,
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
        invoiceSettings: { select: { logoUrl: true } },
      },
    });

    if (!tenant || tenant.status !== 'ACTIVE') return null;

    return {
      companyName: tenant.companyName,
      logoUrl: tenant.invoiceSettings?.logoUrl ?? null,
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

    // Check if email already registered (across all tenants)
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: dto.email }, { firebaseUid: dto.firebaseUid }],
      },
    });

    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

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
          dotNumber: dto.dotNumber,
          carrierType: dto.carrierType,
          mcNumber: dto.mcNumber || null,
          fleetSize: dto.fleetSize,
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
          firebaseUid: dto.firebaseUid,
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
    const cacheKey = buildKey('sally:tenants', 'list', status || 'all');
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
                drivers: true,
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

      // Create default operations settings for the tenant
      await tx.fleetOperationsSettings.upsert({
        where: { tenantId: tenant.id },
        create: { tenantId: tenant.id },
        update: {},
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

    // Bootstrap Desk for the freshly-approved tenant — creates the 12
    // agents + 10 responsibilities so the /dispatcher/desk Crew tab is
    // populated the first time the owner logs in. Idempotent; the
    // module-init sweep in DeskBootstrapService also catches this tenant
    // on the next restart if this call fails.
    await this.deskBootstrap.bootstrapForTenant(tenant.id);

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
    if (dto.dotNumber !== undefined) tenantUpdate.dotNumber = dto.dotNumber;
    if (dto.fleetSize !== undefined) tenantUpdate.fleetSize = dto.fleetSize;
    if (dto.carrierType !== undefined) tenantUpdate.carrierType = dto.carrierType;
    if (dto.mcNumber !== undefined) tenantUpdate.mcNumber = dto.mcNumber;

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
    const cacheKey = buildKey('sally:tenants', 'detail', tenantId);
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
            drivers: true,
            vehicles: true,
            routePlans: true,
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
        dotNumber: tenant.dotNumber,
        carrierType: tenant.carrierType,
        mcNumber: tenant.mcNumber,
        fleetSize: tenant.fleetSize,
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
        totalDrivers: tenant._count.drivers,
        totalVehicles: tenant._count.vehicles,
        totalRoutePlans: tenant._count.routePlans,
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
    if (dto.dotNumber !== undefined) data.dotNumber = dto.dotNumber;
    if (dto.mcNumber !== undefined) data.mcNumber = dto.mcNumber;
    if (dto.carrierType !== undefined) data.carrierType = dto.carrierType as CarrierType;
    if (dto.fleetSize !== undefined) data.fleetSize = dto.fleetSize as FleetSize;
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
    dotNumber: string | null;
    mcNumber: string | null;
    carrierType: CarrierType;
    fleetSize: FleetSize | null;
    timezone: string | null;
  }): OrganizationProfile {
    return {
      companyName: tenant.companyName,
      contactEmail: tenant.contactEmail,
      contactPhone: tenant.contactPhone,
      dotNumber: tenant.dotNumber,
      mcNumber: tenant.mcNumber,
      carrierType: tenant.carrierType,
      fleetSize: tenant.fleetSize,
      timezone: tenant.timezone ?? DEFAULT_TENANT_TIMEZONE,
    };
  }

  /**
   * Pin or unpin the tenant's default factoring company.
   * Pass `null` to unpin. Validates the FK belongs to the same tenant. Emits
   * `sally.tenant.factoring-default-changed` only when the value actually changes.
   */
  async setDefaultFactoringCompany(
    tenantDbId: number,
    factoringCompanyId: number | null,
    changedBy: string,
  ): Promise<{ factoringCompanyId: number | null }> {
    if (factoringCompanyId !== null) {
      const company = await this.prisma.factoringCompany.findFirst({
        where: { id: factoringCompanyId, tenantId: tenantDbId },
      });
      if (!company) {
        throw new NotFoundException('Factoring company not found for this tenant');
      }
    }

    const previous = await this.prisma.tenant.findUnique({
      where: { id: tenantDbId },
      select: { id: true, defaultFactoringCompanyId: true },
    });
    if (!previous) {
      throw new NotFoundException('Tenant not found');
    }

    const updated = await this.prisma.tenant.update({
      where: { id: tenantDbId },
      data: { defaultFactoringCompanyId: factoringCompanyId },
      select: { id: true, defaultFactoringCompanyId: true },
    });

    if (previous.defaultFactoringCompanyId !== factoringCompanyId) {
      await this.events.emit(DOMAIN_EVENTS.TENANT_FACTORING_DEFAULT_CHANGED, tenantDbId, {
        entityId: String(tenantDbId),
        entityType: 'tenant',
        previousFactoringCompanyId: previous.defaultFactoringCompanyId,
        newFactoringCompanyId: factoringCompanyId,
        changedBy,
      });
    }

    await this.invalidateTenantSettingsCache(tenantDbId);
    return { factoringCompanyId: updated.defaultFactoringCompanyId };
  }

  /**
   * Returns the tenant-level settings the dispatcher UI needs (pinned factor,
   * resolved company chip, factor bundle format). Cached because the invoice
   * detail screen reads this on every render.
   */
  async getMyTenantSettings(tenantDbId: number): Promise<{
    factoringCompanyId: number | null;
    factoringCompany: { id: number; companyId: string; companyName: string } | null;
    bundleFormat: BundleFormatType;
    driverPayTiming: DriverPayTimingType;
  }> {
    const cacheKey = buildKey('sally:tenants', 'me-settings', tenantDbId);
    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const tenant = await this.prisma.tenant.findUnique({
          where: { id: tenantDbId },
          select: {
            defaultFactoringCompanyId: true,
            defaultFactoringCompany: {
              select: { id: true, companyId: true, companyName: true },
            },
            bundleFormat: true,
            driverPayTiming: true,
          },
        });
        return {
          factoringCompanyId: tenant?.defaultFactoringCompanyId ?? null,
          factoringCompany: tenant?.defaultFactoringCompany ?? null,
          bundleFormat: (tenant?.bundleFormat ?? BundleFormat.ZIP) as BundleFormatType,
          driverPayTiming: (tenant?.driverPayTiming ?? DriverPayTiming.ON_DELIVERY) as DriverPayTimingType,
        };
      },
      CACHE_TTL_WARM_5M,
    );
  }

  /**
   * Set the tenant's factor bundle format. ADMIN/OWNER only — gating is
   * enforced at the controller layer; the service trusts its caller. Format
   * choice is the canonical config surface for ZIP vs MERGED_PDF (the cleanup
   * phase deleted the env-var flag that previously gated this behavior).
   */
  async setBundleFormat(tenantDbId: number, format: BundleFormatType): Promise<{ format: BundleFormatType }> {
    // Defensive parse — DTO already validates, but the service is also called
    // by tests and may eventually be reused by AI tools. Single source of truth
    // = the schema.
    const parsed = BundleFormatSchema.parse(format);

    try {
      await this.prisma.tenant.update({
        where: { id: tenantDbId },
        data: { bundleFormat: parsed as BundleFormat },
        select: { id: true, bundleFormat: true },
      });
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === 'P2025') {
        throw new NotFoundException('Tenant not found');
      }
      throw err;
    }

    await this.invalidateTenantSettingsCache(tenantDbId);
    return { format: parsed };
  }

  /**
   * Set the tenant's driver pay timing (Phase 4C). ADMIN/OWNER only — gating
   * is enforced at the controller layer. Default ON_DELIVERY preserves
   * pre-Phase-4 behavior; ON_FACTOR_FUND gates settlement creation on
   * Invoice.advanceReceivedAt being set (with shadow-mode for one billing
   * cycle of validation).
   */
  async setDriverPayTiming(tenantDbId: number, timing: DriverPayTimingType): Promise<{ timing: DriverPayTimingType }> {
    const parsed = DriverPayTimingSchema.parse(timing);

    try {
      await this.prisma.tenant.update({
        where: { id: tenantDbId },
        data: { driverPayTiming: parsed as DriverPayTiming },
        select: { id: true, driverPayTiming: true },
      });
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === 'P2025') {
        throw new NotFoundException('Tenant not found');
      }
      throw err;
    }

    await this.invalidateTenantSettingsCache(tenantDbId);
    return { timing: parsed };
  }

  private async invalidateTenantSettingsCache(tenantDbId: number): Promise<void> {
    await this.cache.del(buildKey('sally:tenants', 'me-settings', tenantDbId));
  }

  /** Invalidate all tenant-related caches after a mutation. */
  private async invalidateTenantCache(tenantId?: string): Promise<void> {
    const keys = [
      buildKey('sally:tenants', 'list', 'all'),
      buildKey('sally:tenants', 'list', 'ACTIVE'),
      buildKey('sally:tenants', 'list', 'PENDING_APPROVAL'),
      buildKey('sally:tenants', 'list', 'SUSPENDED'),
      buildKey('sally:tenants', 'list', 'REJECTED'),
    ];
    if (tenantId) {
      keys.push(buildKey('sally:tenants', 'detail', tenantId));
    }
    await Promise.allSettled(keys.map((k) => this.cache.del(k)));
  }
}
