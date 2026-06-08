'use client';

import { useCallback } from 'react';
import { Button } from '@sally/ui/components/ui/button';
import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { Switch } from '@sally/ui/components/ui/switch';
import { DateRangeFilter, HISTORY_PRESETS } from '@/shared/components/ui/date-range-filter';
import { ROLE_OPTIONS, STATUS_OPTIONS } from '../constants';
import { useTenantList } from '../hooks';
import type { ListLoginActivityQuery, LoginEventStatus } from '../types';

interface LoginActivityFiltersProps {
  mode: 'super-admin' | 'tenant-admin';
  value: ListLoginActivityQuery;
  onChange: (next: ListLoginActivityQuery) => void;
  onClear: () => void;
}

const ALL = 'ALL';

/**
 * Filter bar: date range + user + IP + status + role + (super-admin only) tenant.
 *
 * Status/role are single-select with an "All" option for tighter UI — the API
 * supports arrays, so we just send `[value]` when a single value is selected.
 * A multi-select Combobox is nice-to-have for v2.
 *
 * Every change resets `offset` to 0 so pagination starts over.
 */
export function LoginActivityFilters({ mode, value, onChange, onClear }: LoginActivityFiltersProps) {
  const onDateChange = useCallback(
    (from: string | undefined, to: string | undefined) => {
      onChange({ ...value, from: from ?? value.from, to: to ?? value.to, offset: 0 });
    },
    [onChange, value],
  );

  const onStatusChange = useCallback(
    (v: string) => {
      onChange({
        ...value,
        statuses: v === ALL ? undefined : [v as LoginEventStatus],
        offset: 0,
      });
    },
    [onChange, value],
  );

  const onRoleChange = useCallback(
    (v: string) => {
      onChange({ ...value, roles: v === ALL ? undefined : [v], offset: 0 });
    },
    [onChange, value],
  );

  const onTenantChange = useCallback(
    (v: string) => {
      onChange({ ...value, tenantId: v === ALL ? undefined : Number(v), offset: 0 });
    },
    [onChange, value],
  );

  const tenantsQuery = useTenantList(mode === 'super-admin');
  const tenants = tenantsQuery.data ?? [];

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-3">
      <DateRangeFilter dateFrom={value.from} dateTo={value.to} presets={HISTORY_PRESETS} onChange={onDateChange} />

      <Input
        placeholder="User email or name"
        value={value.userQuery ?? ''}
        onChange={(e) => onChange({ ...value, userQuery: e.target.value || undefined, offset: 0 })}
        className="w-56"
      />

      <Input
        placeholder="IP address"
        value={value.ip ?? ''}
        onChange={(e) => onChange({ ...value, ip: e.target.value || undefined, offset: 0 })}
        className="w-40"
      />

      <Select value={value.statuses?.[0] ?? ALL} onValueChange={onStatusChange}>
        <SelectTrigger className="w-36">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All statuses</SelectItem>
          {STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={value.roles?.[0] ?? ALL} onValueChange={onRoleChange}>
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Role" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All roles</SelectItem>
          {ROLE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {mode === 'super-admin' && (
        <Select value={value.tenantId !== undefined ? String(value.tenantId) : ALL} onValueChange={onTenantChange}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder={tenantsQuery.isLoading ? 'Loading tenants…' : 'Tenant'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All tenants</SelectItem>
            {tenants.map((t) => (
              <SelectItem key={t.id} value={String(t.id)}>
                {t.companyName} (#{t.id})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {mode === 'super-admin' && (
        <div className="flex items-center gap-2">
          <Switch
            id="exclude-super-admin"
            checked={value.excludeSuperAdmin ?? true}
            onCheckedChange={(checked) => onChange({ ...value, excludeSuperAdmin: checked, offset: 0 })}
          />
          <Label htmlFor="exclude-super-admin" className="cursor-pointer text-sm text-muted-foreground">
            Tenants only
          </Label>
        </div>
      )}

      <Button variant="ghost" size="sm" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
}
