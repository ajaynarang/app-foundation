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
 * Metadata key for the external source guard.
 */
export const EXTERNAL_SOURCE_KEY = 'externalSource';

/**
 * A resource a route mutates. `model` is the Prisma model name (e.g. the
 * delegate key on PrismaService); `idField` is the business-key column the
 * route param maps onto.
 */
export interface ExternalSourceResource {
  model: string;
  idField: string;
}

/**
 * Decorator to mark a mutating endpoint for the external-source read-only
 * check. Parameterize with the resource so this guard stays domain-free.
 *
 * @example
 * ```typescript
 * @Put(':id')
 * @UseGuards(ExternalSourceGuard)
 * @ExternalSourceCheck({ model: 'widget', idField: 'widgetId' })
 * async update(@Param('id') id: string) {}
 * ```
 */
export const ExternalSourceCheck = (resource: ExternalSourceResource) => SetMetadata(EXTERNAL_SOURCE_KEY, resource);

/**
 * Guard to prevent modification of resources that were synced from an external
 * integration. Such records carry an `externalSource` column and are read-only
 * through the API.
 *
 * The resource (Prisma model + id field) is supplied by `@ExternalSourceCheck`,
 * so the guard switches on no domain-specific models.
 */
@Injectable()
export class ExternalSourceGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const resource = this.reflector.get<ExternalSourceResource>(EXTERNAL_SOURCE_KEY, context.getHandler());

    // If no metadata, skip guard.
    if (!resource) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const { params, user } = request;

    // Extract resource ID from params (named or generic `id`).
    const resourceId = params[resource.idField] || params.id;

    // Get tenant ID from user (should be set by TenantGuard).
    const tenantId = user?.tenant?.id || user?.tenantDbId;

    if (!resourceId) {
      throw new BadRequestException('Resource ID is required');
    }

    if (!tenantId) {
      throw new BadRequestException('Tenant ID is required');
    }

    const record = await this.findResource(resource, resourceId, tenantId);

    if (!record) {
      throw new NotFoundException(`${resource.model} not found: ${resourceId}`);
    }

    if (record.externalSource) {
      throw new ForbiddenException(
        `Cannot modify ${resource.model} from external source: ${record.externalSource}. This is a read-only integration record.`,
      );
    }

    return true;
  }

  /**
   * Find a record by its parameterized model + business-key field, scoped to
   * the tenant. Uses the Prisma delegate named by `resource.model`.
   */
  private async findResource(
    resource: ExternalSourceResource,
    id: string,
    tenantId: number,
  ): Promise<{ externalSource?: string | null } | null> {
    const delegate = (this.prisma as unknown as Record<string, any>)[resource.model];
    if (!delegate || typeof delegate.findFirst !== 'function') {
      throw new BadRequestException(`Unknown resource model: ${resource.model}`);
    }
    return delegate.findFirst({
      where: { [resource.idField]: id, tenantId },
    });
  }
}
