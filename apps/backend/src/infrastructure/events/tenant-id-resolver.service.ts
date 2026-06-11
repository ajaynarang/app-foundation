import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

/**
 * Normalizes the heterogeneous `tenantId` strings that platform services pass
 * to the event bus into the canonical wire-format slug, and (separately)
 * resolves a slug to its numeric DB id.
 *
 * Two valid shapes flow through `emit`:
 *   - `String(<numeric DB id>)` — most domain services, because their Prisma
 *     model field is `tenantId Int`.
 *   - `tenants.tenant_id` slug — services that already worked with the user's
 *     JWT `tenantId` claim, plus the webhook subscription path.
 *
 * Persistence (`domain_event_log.tenant_id Int`) and webhook subscription
 * lookup (`webhook_subscriptions.tenant_id Int`) both need the numeric DB id.
 * The outbound webhook payload to external subscribers, however, must remain
 * the slug — external systems can't see our internal Int DB ids.
 *
 * Caches each direction in-process (no Redis) — slugs and ids are immutable
 * per tenant, tenant churn is low, and the only invalidation case (slug
 * rename) is rare enough to handle by restart.
 */
@Injectable()
export class TenantIdResolver {
  private readonly logger = new Logger(TenantIdResolver.name);
  private readonly idToSlug = new Map<string, string>();
  private readonly slugToId = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the wire-format slug (`demo-acme-2026`) for any of the
   * accepted inputs. Returns `null` if the input is unresolvable.
   */
  async resolveToSlug(rawTenantId: string): Promise<string | null> {
    if (!rawTenantId) return null;

    // Fast path — already a non-numeric string ⇒ assume slug.
    if (isNaN(Number(rawTenantId))) {
      return rawTenantId;
    }

    if (this.idToSlug.has(rawTenantId)) {
      return this.idToSlug.get(rawTenantId);
    }

    const numericId = parseInt(rawTenantId, 10);
    if (isNaN(numericId)) return null;

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: numericId },
      select: { tenantId: true },
    });
    if (!tenant) {
      this.logger.warn(`Cannot resolve tenant slug for DB id ${rawTenantId} — tenant not found`);
      return null;
    }
    this.idToSlug.set(rawTenantId, tenant.tenantId);
    this.slugToId.set(tenant.tenantId, numericId);
    return tenant.tenantId;
  }

  /**
   * Returns the numeric DB id for a slug. Used by writers that need to
   * persist `tenantId Int` (e.g. `domain_event_log.tenant_id`).
   * Accepts either a slug or a numeric-looking string and returns the id.
   */
  async resolveToDbId(rawTenantId: string): Promise<number | null> {
    if (!rawTenantId) return null;

    // Fast path — already a numeric string ⇒ trust it as the DB id.
    if (!isNaN(Number(rawTenantId))) {
      const numericId = parseInt(rawTenantId, 10);
      return isNaN(numericId) ? null : numericId;
    }

    if (this.slugToId.has(rawTenantId)) {
      return this.slugToId.get(rawTenantId);
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { tenantId: rawTenantId },
      select: { id: true },
    });
    if (!tenant) {
      this.logger.warn(`Cannot resolve tenant DB id for slug ${rawTenantId} — tenant not found`);
      return null;
    }
    this.slugToId.set(rawTenantId, tenant.id);
    this.idToSlug.set(String(tenant.id), rawTenantId);
    return tenant.id;
  }
}
