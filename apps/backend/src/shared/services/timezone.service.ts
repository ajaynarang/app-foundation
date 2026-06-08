import { Injectable } from '@nestjs/common';
import { DEFAULT_TENANT_TIMEZONE } from '@app/shared-types';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AppCacheService } from '../../infrastructure/cache/app-cache.service';
import { buildKey } from '../../infrastructure/cache/cache-key.constants';
import { CACHE_TTL_COLD_30M } from '../../constants/cache.constants';
import { isIanaTimezone } from '../validators/is-iana-timezone.validator';

/**
 * Single source of truth for "what time/date is it for this tenant?".
 * Replaces scattered hand-rolled `new Date(); setHours(0,0,0,0)` (server
 * midnight) and ad-hoc Intl usage. All civil-time decisions for tenant-scoped
 * jobs flow through here so a malformed tz degrades to UTC, never throws.
 */
@Injectable()
export class TimezoneService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: AppCacheService,
  ) {}

  /** Tenant's IANA tz, validated; falls back to UTC. Cached (COLD — rarely changes). */
  async resolveTenantTimezone(tenantId: number): Promise<string> {
    return this.cache.getOrSet(
      buildKey('app:tenants', 'tz', tenantId),
      async () => {
        const tenant = await this.prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { timezone: true },
        });
        const tz = tenant?.timezone;
        return tz && isIanaTimezone(tz) ? tz : DEFAULT_TENANT_TIMEZONE;
      },
      CACHE_TTL_COLD_30M,
    );
  }

  /** YYYY-MM-DD for `instant` rendered in `tz`. DST-safe (Intl tz database). */
  localDate(tz: string, instant: Date = new Date()): string {
    const safeTz = isIanaTimezone(tz) ? tz : DEFAULT_TENANT_TIMEZONE;
    // en-CA yields YYYY-MM-DD ordering.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: safeTz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(instant);
  }

  /** Local clock hour (0–23) for `instant` in `tz`. */
  localHour(tz: string, instant: Date = new Date()): number {
    return Number(this.part(tz, instant, 'hour'));
  }

  /** Local day-of-month (1–31) for `instant` in `tz`. */
  localDayOfMonth(tz: string, instant: Date = new Date()): number {
    return Number(this.part(tz, instant, 'day'));
  }

  private part(tz: string, instant: Date, part: 'hour' | 'day'): string {
    const safeTz = isIanaTimezone(tz) ? tz : DEFAULT_TENANT_TIMEZONE;
    const opts: Intl.DateTimeFormatOptions =
      part === 'hour' ? { timeZone: safeTz, hour: '2-digit', hour12: false } : { timeZone: safeTz, day: '2-digit' };
    const formatted = new Intl.DateTimeFormat('en-US', opts).formatToParts(instant);
    return formatted.find((p) => p.type === part)?.value ?? '0';
  }
}
