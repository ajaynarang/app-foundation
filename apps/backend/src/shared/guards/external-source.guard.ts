import {
  Injectable,
  CanActivate,
  ExecutionContext,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../infrastructure/database/prisma.service';

/**
 * Metadata key for external source guard
 */
export const EXTERNAL_SOURCE_KEY = 'externalSource';

/**
 * Decorator to mark an endpoint for external source checking.
 * Use this on PUT/DELETE endpoints for drivers and vehicles.
 *
 * @param resourceType - Type of resource to check ('driver' | 'vehicle')
 *
 * @example
 * ```typescript
 * @Put(':driver_id')
 * @UseGuards(ExternalSourceGuard)
 * @ExternalSourceCheck('driver')
 * async updateDriver(@Param('driver_id') driverId: string) {
 *   // Guard ensures driver is not from external source
 * }
 * ```
 */
export const ExternalSourceCheck = (resourceType: 'driver' | 'vehicle') =>
  SetMetadata(EXTERNAL_SOURCE_KEY, resourceType);

/**
 * Guard to prevent modification of resources from external sources.
 * Replaces the duplicated validateNotExternal() methods in controllers.
 *
 * This guard:
 * 1. Checks if resource exists
 * 2. Verifies resource is not from an external integration (TMS/ELD)
 * 3. Throws ForbiddenException if resource is read-only
 *
 * Resources from external sources (Samsara, McLeod, etc.) are read-only
 * and cannot be modified through the API.
 */
@Injectable()
export class ExternalSourceGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get resource type from metadata
    const resourceType = this.reflector.get<'driver' | 'vehicle'>(EXTERNAL_SOURCE_KEY, context.getHandler());

    // If no metadata, skip guard
    if (!resourceType) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const { params, user } = request;

    // Extract resource ID from params
    const resourceId = params.driver_id || params.vehicle_id || params.id;

    // Get tenant ID from user (should be set by TenantGuard)
    const tenantId = user?.tenant?.id || user?.tenantDbId;

    if (!resourceId) {
      throw new BadRequestException('Resource ID is required');
    }

    if (!tenantId) {
      throw new BadRequestException('Tenant ID is required');
    }

    // Find resource
    const resource = await this.findResource(resourceType, resourceId, tenantId);

    if (!resource) {
      throw new NotFoundException(`${this.capitalize(resourceType)} not found: ${resourceId}`);
    }

    // Check if resource is from external source
    if (resource.externalSource) {
      throw new ForbiddenException(
        `Cannot modify ${resourceType} from external source: ${resource.externalSource}. This is a read-only integration record.`,
      );
    }

    return true;
  }

  /**
   * Find resource by type, ID, and tenant
   */
  private async findResource(type: 'driver' | 'vehicle', id: string, tenantId: number): Promise<any> {
    switch (type) {
      case 'driver':
        return this.prisma.driver.findFirst({
          where: { driverId: id, tenantId },
        });

      case 'vehicle':
        return this.prisma.vehicle.findFirst({
          where: { vehicleId: id, tenantId },
        });

      default:
        throw new BadRequestException(`Unknown resource type: ${String(type)}`);
    }
  }

  /**
   * Capitalize first letter
   */
  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
