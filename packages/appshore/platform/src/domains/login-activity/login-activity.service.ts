import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { Prisma, LoginEventStatus, type UserRole } from '@appshore/db';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AppCacheService } from '../../infrastructure/cache/app-cache.service';
import type {
  ListLoginActivityQuery,
  ListLoginActivityResponse,
  LoginActivityEvent,
  LoginActivitySummary,
  LoginActivitySummaryQuery,
} from '@app/shared-types';
import { LOGIN_ACTIVITY, parseDeviceLabel } from './constants';
import { loginActivityCacheKeys, rolesKey } from './login-activity.cache';

// The Zod schema applies `.default()` to limit/offset, which makes those
// fields required on the inferred output type but optional on the input
// the controller receives. The service accepts the looser input shape.
type ListLoginActivityInput = Omit<ListLoginActivityQuery, 'limit' | 'offset'> & {
  limit?: number;
  offset?: number;
};

/**
 * Scope under which the caller is allowed to read login activity.
 *
 * `isSuperAdmin: false` REQUIRES a tenantId — checked defensively in the
 * service even though the controller already enforces it.
 */
export type LoginActivityScope = { isSuperAdmin: false; tenantId: number } | { isSuperAdmin: true; tenantId?: number };

const MS_PER_DAY = 86_400_000;
const RECENT_SUCCESS_SCAN_LIMIT = 200;

@Injectable()
export class LoginActivityService {
  private readonly logger = new Logger(LoginActivityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: AppCacheService,
  ) {}

  // ─── public API ──────────────────────────────────────────────────────

  async list(scope: LoginActivityScope, params: ListLoginActivityInput): Promise<ListLoginActivityResponse> {
    this.assertScope(scope);
    const where = this.buildWhere(scope, params);
    const limit = Math.min(params.limit ?? LOGIN_ACTIVITY.DEFAULT_PAGE_LIMIT, LOGIN_ACTIVITY.MAX_PAGE_LIMIT);
    const offset = Math.max(params.offset ?? 0, 0);

    const include: Prisma.LoginEventInclude = {
      user: {
        select: { id: true, email: true, firstName: true, lastName: true, role: true },
      },
      // Super-admin needs the tenant column to render; tenant flow doesn't.
      ...(scope.isSuperAdmin ? { tenant: { select: { id: true, companyName: true } } } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.loginEvent.findMany({
        where,
        include,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.loginEvent.count({ where }),
    ]);

    return {
      items: rows.map((r: any) => this.toResponseEvent(r, scope.isSuperAdmin)),
      total,
      limit,
      offset,
    };
  }

  async summary(scope: LoginActivityScope, params: LoginActivitySummaryQuery): Promise<LoginActivitySummary> {
    this.assertScope(scope);
    const tenantId = this.resolveTenantId(scope, params.tenantId);
    const key = loginActivityCacheKeys.summary({
      tenantId,
      from: params.from,
      to: params.to,
      rolesKey: rolesKey(params.roles),
      excludeSuperAdmin: params.excludeSuperAdmin ?? false,
    });

    return this.cache.getOrSet<LoginActivitySummary>(
      key,
      () => this.computeSummary(scope, params),
      LOGIN_ACTIVITY.SUMMARY_CACHE_TTL_SECONDS * 1000,
    );
  }

  // ─── invariants & scope ──────────────────────────────────────────────

  private assertScope(scope: LoginActivityScope): void {
    if (!scope.isSuperAdmin && !scope.tenantId) {
      throw new InternalServerErrorException('Tenant scope missing on non-super-admin login activity call');
    }
  }

  private resolveTenantId(scope: LoginActivityScope, requested?: number): number | undefined {
    // Tenant-scoped callers can NEVER widen scope — ignore client-supplied tenantId.
    if (!scope.isSuperAdmin) return scope.tenantId;
    return requested;
  }

  // ─── where builder ───────────────────────────────────────────────────

  private buildWhere(scope: LoginActivityScope, params: ListLoginActivityInput): Prisma.LoginEventWhereInput {
    const where: Prisma.LoginEventWhereInput = {
      createdAt: this.rangeFilter(params.from, params.to),
    };

    const tenantId = this.resolveTenantId(scope, params.tenantId);
    if (tenantId !== undefined) where.tenantId = tenantId;

    if (params.statuses?.length) {
      where.status = { in: params.statuses as LoginEventStatus[] };
    }
    if (params.ip) where.ip = params.ip;

    const userFilter = this.buildUserFilter(params);
    if (userFilter) where.user = { is: userFilter };

    // "Tenants only" — exclude platform-staff sign-ins. Composed as an
    // AND clause so it stacks cleanly on top of any roles/userQuery
    // constraints already on `where.user.is`.
    if (params.excludeSuperAdmin) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        { user: { is: { role: { not: 'SUPER_ADMIN' as UserRole } } } },
      ];
    }

    return where;
  }

  private buildUserFilter(params: ListLoginActivityInput): Prisma.UserWhereInput | null {
    const filter: Prisma.UserWhereInput = {};

    if (params.userQuery) {
      const q = params.userQuery.trim();
      filter.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (params.roles?.length) {
      filter.role = { in: params.roles as UserRole[] };
    }

    return Object.keys(filter).length > 0 ? filter : null;
  }

  private rangeFilter(from: string, to: string): { gte: Date; lt: Date } {
    const fromMs = Date.parse(from);
    const toMs = Date.parse(to);
    if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
      throw new BadRequestException('Invalid from/to date');
    }
    if (toMs < fromMs) {
      throw new BadRequestException('"to" must be on or after "from"');
    }
    if (toMs - fromMs > LOGIN_ACTIVITY.MAX_RANGE_DAYS * MS_PER_DAY) {
      throw new BadRequestException(`Range cannot exceed ${LOGIN_ACTIVITY.MAX_RANGE_DAYS} days`);
    }
    // `to` is treated as inclusive of the whole day.
    return { gte: new Date(fromMs), lt: new Date(toMs + MS_PER_DAY) };
  }

  // ─── shaping ─────────────────────────────────────────────────────────

  private toResponseEvent(row: any, includeTenant: boolean): LoginActivityEvent {
    const base: LoginActivityEvent = {
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      status: row.status,
      ip: row.ip ?? null,
      userAgent: row.userAgent ?? null,
      deviceLabel: parseDeviceLabel(row.userAgent),
      deviceId: row.deviceId ?? null,
      sessionId: row.sessionId ?? null,
      failReason: row.failReason ?? null,
      user: row.user
        ? {
            id: row.user.id,
            email: row.user.email,
            firstName: row.user.firstName,
            lastName: row.user.lastName,
            role: row.user.role,
          }
        : null,
    };
    if (includeTenant) {
      // Tenant column is `companyName` in the DB; expose as `name` to clients.
      base.tenant = row.tenant ? { id: row.tenant.id, name: row.tenant.companyName } : null;
    }
    return base;
  }

  // ─── summary computation ─────────────────────────────────────────────

  private async computeSummary(
    scope: LoginActivityScope,
    params: LoginActivitySummaryQuery,
  ): Promise<LoginActivitySummary> {
    const range = this.rangeFilter(params.from, params.to);
    const periodMs = range.lt.getTime() - range.gte.getTime();
    const priorRange = {
      gte: new Date(range.gte.getTime() - periodMs),
      lt: range.gte,
    };

    const tenantId = this.resolveTenantId(scope, params.tenantId);
    const tenantWhere: Prisma.LoginEventWhereInput = tenantId !== undefined ? { tenantId } : {};
    const userRolesFilter: Prisma.UserWhereInput | undefined = params.roles?.length
      ? { role: { in: params.roles as UserRole[] } }
      : undefined;
    const userWhere: Prisma.LoginEventWhereInput = userRolesFilter ? { user: { is: userRolesFilter } } : {};

    const baseWhere: Prisma.LoginEventWhereInput = { ...tenantWhere, ...userWhere };

    // "Tenants only" toggle — exclude SUPER_ADMIN users from KPIs + Notable.
    // Applied as an AND clause so it stacks on top of any user-role filter.
    if (params.excludeSuperAdmin) {
      baseWhere.AND = [
        ...(Array.isArray(baseWhere.AND) ? baseWhere.AND : baseWhere.AND ? [baseWhere.AND] : []),
        { user: { is: { role: { not: 'SUPER_ADMIN' as UserRole } } } },
      ];
    }

    // KPI counts + unique groupings + brute-force + recent SUCCESS sample.
    const [totalSignIns, failedAttempts, prevFailed, uniqueUsersRows, uniqueIpsRows, bruteRows, recentSuccess] =
      await Promise.all([
        this.prisma.loginEvent.count({
          where: { ...baseWhere, createdAt: range, status: LoginEventStatus.SUCCESS },
        }),
        this.prisma.loginEvent.count({
          where: { ...baseWhere, createdAt: range, status: LoginEventStatus.FAILED },
        }),
        this.prisma.loginEvent.count({
          where: { ...baseWhere, createdAt: priorRange, status: LoginEventStatus.FAILED },
        }),
        this.prisma.loginEvent.groupBy({
          by: ['userId'],
          where: { ...baseWhere, createdAt: range },
        }),
        this.prisma.loginEvent.groupBy({
          by: ['ip'],
          where: { ...baseWhere, createdAt: range, ip: { not: null } },
        }),
        this.prisma.loginEvent.groupBy({
          by: ['userId'],
          where: { ...baseWhere, createdAt: range, status: LoginEventStatus.FAILED },
          _count: { _all: true },
          having: {
            userId: { _count: { gte: LOGIN_ACTIVITY.BRUTE_FORCE_FAIL_THRESHOLD } },
          },
          orderBy: { _count: { userId: 'desc' } },
          take: LOGIN_ACTIVITY.NOTABLE_LIST_CAP,
        }),
        this.prisma.loginEvent.findMany({
          where: { ...baseWhere, createdAt: range, status: LoginEventStatus.SUCCESS },
          include: {
            user: { select: { id: true, email: true } },
            tenant: { select: { id: true, timezone: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: RECENT_SUCCESS_SCAN_LIMIT,
        }),
      ]);

    const bruteForceSuspects = await this.resolveBruteSuspects(bruteRows);
    const newIpSignIns = await this.detectNewIpSignIns(recentSuccess as any[], baseWhere, range);
    const offHoursSignIns = this.detectOffHoursSignIns(recentSuccess as any[]);

    return {
      kpis: {
        totalSignIns,
        failedAttempts,
        failedDeltaPct: this.failedDelta(failedAttempts, prevFailed),
        uniqueUsers: uniqueUsersRows.length,
        uniqueIps: uniqueIpsRows.length,
      },
      notable: {
        bruteForceSuspects,
        newIpSignIns,
        offHoursSignIns,
      },
      timezoneUsed: (recentSuccess as any[])[0]?.tenant?.timezone ?? 'UTC',
    };
  }

  private failedDelta(current: number, prior: number): number {
    if (prior === 0) return current === 0 ? 0 : 100;
    return Math.round(((current - prior) / prior) * 100);
  }

  private async resolveBruteSuspects(
    rows: Array<{ userId: number; _count: { _all: number } }>,
  ): Promise<LoginActivitySummary['notable']['bruteForceSuspects']> {
    if (rows.length === 0) return [];
    const userIds = rows.map((r) => r.userId).filter((id) => id !== null && id !== undefined);
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true },
        })
      : [];
    const byId = new Map(users.map((u) => [u.id, u.email]));

    return rows.map((r) => ({
      userId: r.userId,
      email: byId.get(r.userId) ?? '(unknown)',
      count: r._count?._all ?? 0,
      // v1 simplification — the design calls out a follow-up to compute the
      // true 1-hour windowed flag in a separate query.
      hasOneHourBurst: false,
    }));
  }

  private async detectNewIpSignIns(
    recentSuccess: Array<any>,
    baseWhere: Prisma.LoginEventWhereInput,
    range: { gte: Date; lt: Date },
  ): Promise<LoginActivitySummary['notable']['newIpSignIns']> {
    const out: LoginActivitySummary['notable']['newIpSignIns'] = [];
    const lookbackStart = new Date(range.gte.getTime() - LOGIN_ACTIVITY.NEW_IP_LOOKBACK_DAYS * MS_PER_DAY);

    for (const ev of recentSuccess) {
      if (!ev.ip || !ev.user) continue;
      const seen = await this.prisma.loginEvent.count({
        where: {
          ...baseWhere,
          userId: ev.userId,
          ip: ev.ip,
          createdAt: { gte: lookbackStart, lt: range.gte },
          status: LoginEventStatus.SUCCESS,
        },
      });
      if (seen === 0) {
        out.push({
          eventId: ev.id,
          userId: ev.userId,
          email: ev.user.email,
          ip: ev.ip,
          occurredAt: ev.createdAt.toISOString(),
        });
        if (out.length >= LOGIN_ACTIVITY.NOTABLE_LIST_CAP) break;
      }
    }

    return out;
  }

  private detectOffHoursSignIns(recentSuccess: Array<any>): LoginActivitySummary['notable']['offHoursSignIns'] {
    const out: LoginActivitySummary['notable']['offHoursSignIns'] = [];
    for (const ev of recentSuccess) {
      if (!ev.user) continue;
      const tz = ev.tenant?.timezone ?? 'UTC';
      const hour = this.hourInTimezone(ev.createdAt, tz);
      if (hour < LOGIN_ACTIVITY.OFF_HOURS.startHour || hour >= LOGIN_ACTIVITY.OFF_HOURS.endHour) {
        out.push({
          eventId: ev.id,
          userId: ev.userId,
          email: ev.user.email,
          ip: ev.ip ?? null,
          occurredAt: ev.createdAt.toISOString(),
        });
        if (out.length >= LOGIN_ACTIVITY.NOTABLE_LIST_CAP) break;
      }
    }
    return out;
  }

  private hourInTimezone(d: Date, tz: string): number {
    try {
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour: '2-digit',
        hour12: false,
      });
      const parts = fmt.formatToParts(d);
      const h = parts.find((p) => p.type === 'hour')?.value ?? '0';
      return parseInt(h, 10) % 24;
    } catch (err) {
      this.logger.warn(`Unknown timezone "${tz}" for off-hours check; falling back to UTC: ${(err as Error).message}`);
      return d.getUTCHours();
    }
  }
}
