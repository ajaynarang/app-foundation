'use client';

import { Button } from '@/shared/components/ui/button';

import { useUnsnoozeSuppression } from '../../hooks/use-snooze';

/**
 * Rendered inside HandledMode when the episode's entity has an active
 * suppression. Matches the "caution" tone used elsewhere for snoozed
 * signals and exposes a single Un-snooze affordance.
 */
export function HandledSnoozeCard({
  suppressionId,
  suppressUntil,
}: {
  suppressionId: string;
  suppressUntil: string | null;
}) {
  const unsnooze = useUnsnoozeSuppression();
  return (
    <section className="rounded-lg border border-caution/40 bg-caution/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-foreground">Snoozed</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            {suppressUntil
              ? `Sally won't bring this up until ${new Date(suppressUntil).toLocaleString()}`
              : "Sally won't bring this up until you un-snooze."}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => unsnooze.mutate(suppressionId)} loading={unsnooze.isPending}>
          Un-snooze
        </Button>
      </div>
    </section>
  );
}
