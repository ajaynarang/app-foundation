import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { Tenant } from '@prisma/client';

/**
 * Base controller providing tenant-related utilities.
 * Eliminates duplicate tenant validation code across controllers.
 *
 * Usage:
 * ```typescript
 * @Controller('drivers')
 * export class DriversController extends BaseTenantController {
 *   constructor(
 *     prisma: PrismaService,
 *     private readonly driversService: DriversService,
 *   ) {
 *     super(prisma);
 *   }
 *
 *   @Get()
 *   async listDrivers(@CurrentUser() user: any) {
 *     const tenantDbId = await this.getTenantDbId(user);
 *     return this.driversService.findAll(tenantDbId);
 *   }
 * }
 * ```
 */
@Injectable()
export abstract class BaseTenantController {
  constructor(protected readonly prisma: PrismaService) {}

  /**
   * Get tenant by tenantId (string).
   * Throws NotFoundException if tenant not found.
   *
   * @param tenantId - The tenant ID (string, not database ID)
   * @returns Promise<Tenant>
   * @throws NotFoundException if tenant not found
   */
  protected async getTenant(tenantId: string): Promise<Tenant> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return tenant;
  }

  /**
   * Get tenant database ID from authenticated user.
   * This is the most common use case - use this in most endpoints.
   *
   * @param user - The authenticated user object (from @CurrentUser() decorator)
   * @returns Promise<number> - The tenant's database ID
   * @throws NotFoundException if tenant not found
   */
  protected async getTenantDbId(user: any): Promise<number> {
    const tenant = await this.getTenant(user.tenantId);
    return tenant.id;
  }

  /**
   * Get user database ID from the external string userId (e.g. JWT `sub`).
   * Mirrors {@link getTenantDbId}: keep string ids at the wire boundary,
   * resolve to the numeric DB id only when crossing into code that joins
   * on it (e.g. principal construction, audit writes).
   *
   * @param userId - The external string user id (`User.userId`)
   * @returns Promise<number> - The user's database id (`User.id`)
   * @throws NotFoundException if user not found
   */
  protected async getUserDbId(userId: string): Promise<number> {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user.id;
  }

  /**
   * Validate that a resource belongs to the user's tenant.
   * Throws ForbiddenException if tenant doesn't match.
   *
   * @param resourceTenantId - The tenant ID of the resource (database ID)
   * @param userTenantId - The tenant ID from the authenticated user (string)
   * @throws ForbiddenException if tenant access denied
   * @throws NotFoundException if tenant not found
   */
  protected async validateTenantAccess(resourceTenantId: number, userTenantId: string): Promise<void> {
    const tenant = await this.getTenant(userTenantId);

    if (resourceTenantId !== tenant.id) {
      throw new ForbiddenException('You do not have access to this resource');
    }
  }

  /**
   * Enforce driver-scoped access — when the caller is a DRIVER, ensure
   * the resource belongs to them. Non-driver roles skip this check.
   *
   * @param user - The authenticated user (from @CurrentUser())
   * @param resourceDriverId - The driverId on the resource being accessed
   * @param message - Optional custom error message
   * @throws ForbiddenException if driver doesn't own the resource
   */
  protected assertDriverScopedAccess(
    user: { role: string; driverId?: string },
    resourceDriverId: string | null | undefined,
    message = 'You can only access your own records',
  ): void {
    if (user.role === 'DRIVER' && resourceDriverId !== user.driverId) {
      throw new ForbiddenException(message);
    }
  }

  /**
   * Ensure the caller has a linked driver profile.
   * Use at the top of driver self-service endpoints.
   *
   * @param user - The authenticated user (from @CurrentUser())
   * @throws ForbiddenException if no driver profile linked
   */
  protected assertHasDriverProfile<T extends { driverId?: string }>(user: T): asserts user is T & { driverId: string } {
    if (!user.driverId) {
      throw new ForbiddenException('No driver profile linked to this account');
    }
  }
}
