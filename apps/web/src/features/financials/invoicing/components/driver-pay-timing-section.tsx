'use client';

import { useAuthStore } from '@/features/auth/store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@sally/ui/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@sally/ui/components/ui/radio-group';
import { Label } from '@sally/ui/components/ui/label';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { useTenantFactoringDefault } from '../use-tenant-factoring-default';
import { useSetTenantDriverPayTiming } from '../use-tenant-driver-pay-timing';
import { DriverPayTimingSchema, USER_ROLES, type DriverPayTiming } from '@sally/shared-types';

const TIMING = DriverPayTimingSchema.enum;

interface TimingOption {
  value: DriverPayTiming;
  label: string;
  hint: string;
  default?: boolean;
}

const OPTIONS: TimingOption[] = [
  {
    value: TIMING.ON_DELIVERY,
    label: 'Pay drivers on load delivery',
    hint: 'Settlements run as soon as the load is delivered. Cash flow risk is on the carrier — we float driver pay until the factor funds.',
    default: true,
  },
  {
    value: TIMING.ON_FACTOR_FUND,
    label: 'Pay drivers when factor funds',
    hint: 'Settlements wait until the factor wires the advance. 24-48hr delay for the driver, but no cash flow risk on the carrier.',
  },
];

/**
 * Phase 4C — tenant-level setting for when settlements may be created relative
 * to factor funding. ADMIN/OWNER only. Settlement creation gate runs
 * server-side (with a one-billing-cycle shadow mode rollout).
 */
export function DriverPayTimingSection() {
  const user = useAuthStore((s) => s.user);
  const canEdit = user?.role === USER_ROLES.ADMIN || user?.role === USER_ROLES.OWNER;

  const { data, isLoading } = useTenantFactoringDefault();
  const setTiming = useSetTenantDriverPayTiming();

  const current: DriverPayTiming = (data?.driverPayTiming as DriverPayTiming | undefined) ?? TIMING.ON_DELIVERY;

  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle className="text-base text-foreground">Driver pay timing</CardTitle>
        <CardDescription className="text-muted-foreground">
          When the settlement engine may create settlements for factored loads.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (
          <RadioGroup
            value={current}
            onValueChange={(value) => {
              if (!canEdit) return;
              if (value === current) return;
              const parsed = DriverPayTimingSchema.safeParse(value);
              if (!parsed.success) return;
              setTiming.mutate(parsed.data);
            }}
            disabled={!canEdit || setTiming.isPending}
            className="space-y-3"
          >
            {OPTIONS.map((opt) => (
              <div key={opt.value} className="flex items-start gap-3 rounded-md border border-border bg-muted/30 p-3">
                <RadioGroupItem
                  value={opt.value}
                  id={`driver-pay-timing-${opt.value}`}
                  disabled={!canEdit || setTiming.isPending}
                  aria-describedby={`driver-pay-timing-${opt.value}-hint`}
                  className="mt-0.5"
                />
                <div className="flex-1 space-y-1">
                  <Label htmlFor={`driver-pay-timing-${opt.value}`} className="text-sm font-medium text-foreground">
                    {opt.label}
                    {opt.default && (
                      <span className="ml-2 rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        Default
                      </span>
                    )}
                  </Label>
                  <p id={`driver-pay-timing-${opt.value}-hint`} className="text-xs text-muted-foreground">
                    {opt.hint}
                  </p>
                </div>
              </div>
            ))}
          </RadioGroup>
        )}
        {!canEdit && !isLoading && (
          <p className="mt-3 text-xs text-muted-foreground">Only an admin or owner can change this setting.</p>
        )}
      </CardContent>
    </Card>
  );
}
