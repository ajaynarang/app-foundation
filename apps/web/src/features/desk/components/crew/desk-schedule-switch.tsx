'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { PlayCircle, PauseCircle, Clock } from 'lucide-react';

import { Label } from '@/shared/components/ui/label';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Switch } from '@/shared/components/ui/switch';
import { cn } from '@/shared/lib/utils';

import { useAuthStore } from '@/features/auth/store';

import { useDeskSchedule, useToggleDeskSchedule } from '../../hooks/use-desk-schedule';
import { canManageDeskSchedule } from '../../lib/permissions';

/**
 * Tenant-wide master switch for autonomous Desk runs. The single safety
 * control that arms (or pauses) every responsibility's automatic runs at
 * once. Default OFF — while you're testing, leave it off and nothing runs on
 * its own. Manual "Run now" is unaffected either way.
 *
 * OWNER/ADMIN/SUPER_ADMIN can flip it; everyone else sees the state read-only.
 */
export function DeskScheduleSwitch() {
  const { data, isLoading } = useDeskSchedule();
  const toggle = useToggleDeskSchedule();
  const user = useAuthStore((s) => s.user);

  const canManage = useMemo(() => canManageDeskSchedule(user ? { role: user.role, dbId: user.dbId } : null), [user]);
  const enabled = data?.enabled ?? false;
  const timezone = data?.timezone;

  if (isLoading) return <Skeleton className="h-[72px] w-full rounded-lg" />;

  return (
    <section
      className={cn(
        'flex items-center justify-between gap-4 rounded-lg border bg-card p-4',
        enabled ? 'border-emerald-500/40' : 'border-border',
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {enabled ? (
          <PlayCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
        ) : (
          <PauseCircle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <div className="min-w-0 space-y-0.5">
          <Label htmlFor="desk-master-schedule" className="text-sm font-medium text-foreground">
            {enabled ? 'Run agents automatically' : 'Automatic runs paused'}
          </Label>
          <p className="text-xs text-muted-foreground">
            {enabled
              ? 'Agents run on their own. Each responsibility still needs its own automatic runs turned on.'
              : 'All automatic runs are paused tenant-wide. Manual “Run now” still works.'}
          </p>
          {timezone && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3 shrink-0" aria-hidden />
              <span>
                Schedules run in {timezone}.{' '}
                <Link
                  href="/settings/organization"
                  className="text-foreground underline underline-offset-4 hover:text-muted-foreground"
                >
                  Change
                </Link>
              </span>
            </p>
          )}
        </div>
      </div>
      <Switch
        id="desk-master-schedule"
        aria-label={enabled ? 'Pause all automatic runs' : 'Run agents automatically'}
        checked={enabled}
        onCheckedChange={(next) => toggle.mutate(next)}
        disabled={!canManage || toggle.isPending}
      />
    </section>
  );
}
