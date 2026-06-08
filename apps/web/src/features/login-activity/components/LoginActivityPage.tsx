'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLoginActivityList, useLoginActivitySummary } from '../hooks';
import type { ListLoginActivityQuery, LoginActivityEvent, LoginActivityScope, LoginEventStatus } from '../types';
import { KpiStrip } from './KpiStrip';
import { LoginActivityFilters } from './LoginActivityFilters';
import { LoginActivityTable } from './LoginActivityTable';
import { LoginEventDetailSheet } from './LoginEventDetailSheet';
import { NotableCard } from './NotableCard';

interface LoginActivityPageProps {
  mode: 'super-admin' | 'tenant-admin';
}

const DEFAULT_LIMIT = 50;

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoString(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function defaultRange() {
  return { from: daysAgoString(7), to: todayString() };
}

function readInitialFilters(params: URLSearchParams, mode: 'super-admin' | 'tenant-admin'): ListLoginActivityQuery {
  const range = defaultRange();
  const status = params.get('status');
  const role = params.get('role');
  const tenantId = params.get('tenantId');
  const excludeSuperAdminParam = params.get('excludeSuperAdmin');
  return {
    from: params.get('from') ?? range.from,
    to: params.get('to') ?? range.to,
    userQuery: params.get('user') ?? undefined,
    ip: params.get('ip') ?? undefined,
    statuses: status ? [status as LoginEventStatus] : undefined,
    roles: role ? [role] : undefined,
    tenantId: tenantId ? Number(tenantId) : undefined,
    // Default ON for super-admin mode (filters out platform-staff noise),
    // irrelevant for tenant-admin (the tenant endpoint ignores the flag).
    excludeSuperAdmin:
      excludeSuperAdminParam !== null ? excludeSuperAdminParam === 'true' : mode === 'super-admin' ? true : undefined,
    limit: DEFAULT_LIMIT,
    offset: 0,
  };
}

function filtersToSearchParams(filters: ListLoginActivityQuery, mode: 'super-admin' | 'tenant-admin'): string {
  const usp = new URLSearchParams();
  if (filters.from) usp.set('from', filters.from);
  if (filters.to) usp.set('to', filters.to);
  if (filters.userQuery) usp.set('user', filters.userQuery);
  if (filters.ip) usp.set('ip', filters.ip);
  if (filters.statuses?.[0]) usp.set('status', filters.statuses[0]);
  if (filters.roles?.[0]) usp.set('role', filters.roles[0]);
  if (filters.tenantId) usp.set('tenantId', String(filters.tenantId));
  // Only serialize when the user has deviated from the default (true for
  // super-admin). Keeps URLs clean for the common case.
  if (mode === 'super-admin' && filters.excludeSuperAdmin === false) {
    usp.set('excludeSuperAdmin', 'false');
  }
  return usp.toString();
}

/**
 * Login Activity page shell. Mounted by both Super Admin (mode='super-admin')
 * and Tenant Admin (mode='tenant-admin') routes.
 *
 * Owns URL state for all filters and the detail-sheet selection. Children are
 * leaf-pure — they fire callbacks, never read URL or query-cache directly.
 */
export function LoginActivityPage({ mode }: LoginActivityPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tableRef = useRef<HTMLDivElement | null>(null);

  const [filters, setFiltersInternal] = useState<ListLoginActivityQuery>(() =>
    readInitialFilters(new URLSearchParams(searchParams.toString()), mode),
  );

  const setFilters = useCallback(
    (next: ListLoginActivityQuery) => {
      setFiltersInternal(next);
      const qs = filtersToSearchParams(next, mode);
      router.replace(qs ? `?${qs}` : '?', { scroll: false });
    },
    [router, mode],
  );

  const scope: LoginActivityScope = mode === 'super-admin' ? 'super' : 'tenant';

  const listQuery = useLoginActivityList(scope, filters);
  const summaryParams = useMemo(
    () => ({
      from: filters.from,
      to: filters.to,
      tenantId: filters.tenantId,
      roles: filters.roles,
      excludeSuperAdmin: filters.excludeSuperAdmin,
    }),
    [filters.from, filters.to, filters.tenantId, filters.roles, filters.excludeSuperAdmin],
  );
  const summaryQuery = useLoginActivitySummary(scope, summaryParams);

  const [selected, setSelected] = useState<LoginActivityEvent | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Keep the selected event in sync with the freshest list data — see
  // sally-frontend-patterns §10: sheets showing list data derive from the
  // query cache, never from stale local state.
  const selectedFresh = useMemo(() => {
    if (!selected) return null;
    const fromCache = listQuery.data?.items.find((e) => e.id === selected.id);
    return fromCache ?? selected;
  }, [selected, listQuery.data]);

  const scrollToTable = useCallback(() => {
    tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const applyAndScroll = useCallback(
    (patch: Partial<ListLoginActivityQuery>) => {
      setFilters({ ...filters, ...patch, offset: 0 });
      // Scroll on the next paint so the layout has settled.
      requestAnimationFrame(scrollToTable);
    },
    [filters, setFilters, scrollToTable],
  );

  const onClear = useCallback(() => {
    const range = defaultRange();
    setFilters({
      from: range.from,
      to: range.to,
      limit: DEFAULT_LIMIT,
      offset: 0,
      // Preserve the per-mode default for the SUPER_ADMIN exclusion toggle.
      excludeSuperAdmin: mode === 'super-admin' ? true : undefined,
    });
  }, [setFilters, mode]);

  const subtitle = mode === 'super-admin' ? 'Sign-in events across all tenants' : 'Sign-in events for your team';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Login Activity</h1>
        <p className="mt-1 text-sm text-muted-foreground md:text-base">{subtitle}</p>
      </div>

      <KpiStrip summary={summaryQuery.data} isLoading={summaryQuery.isLoading} />

      <NotableCard
        summary={summaryQuery.data}
        onViewAllBruteForce={() => applyAndScroll({ statuses: ['FAILED'] })}
        onViewAllNewIp={() => applyAndScroll({ statuses: ['SUCCESS'] })}
        onViewAllOffHours={() => applyAndScroll({ statuses: ['SUCCESS'] })}
      />

      <LoginActivityFilters mode={mode} value={filters} onChange={setFilters} onClear={onClear} />

      <div ref={tableRef}>
        <LoginActivityTable
          mode={mode}
          items={listQuery.data?.items}
          total={listQuery.data?.total ?? 0}
          limit={filters.limit ?? DEFAULT_LIMIT}
          offset={filters.offset ?? 0}
          isLoading={listQuery.isLoading}
          onRowClick={(event) => {
            setSelected(event);
            setSheetOpen(true);
          }}
          onPageChange={(nextOffset) => setFilters({ ...filters, offset: nextOffset })}
        />
      </div>

      <LoginEventDetailSheet open={sheetOpen} onOpenChange={setSheetOpen} event={selectedFresh} />
    </div>
  );
}
