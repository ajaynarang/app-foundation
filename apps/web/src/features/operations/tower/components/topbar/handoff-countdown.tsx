'use client';

import { useEffect, useState } from 'react';
import { Check, CircleDot } from 'lucide-react';
import { useFormatters } from '@/shared/providers/PreferencesProvider';

interface HandoffStatusProps {
  /** Whether the incoming shift-handoff notes have been acknowledged. */
  acknowledged: boolean;
  /** When the handoff was acknowledged — ISO timestamp, if it has been. */
  acknowledgedAt?: string | null;
}

/** date-fns format: "Mon · May 18 · 12:00 PM" — weekday, compact date, 12h time. */
const CLOCK_FORMAT = 'EEE · MMM d · h:mm a';
/** Short clock for the acknowledgement time: "12:00 PM". */
const TIME_FORMAT = 'h:mm a';

/**
 * Topbar block: the live clock + the real shift-handoff state.
 *
 * Earlier this showed a "handoff in 3h 46m" countdown — but Sally has no
 * shift-schedule data, so that number was fabricated (see issue #756). It is
 * replaced here with honest, real signals only:
 *  - the current time, via the shared `formatTimestamp` formatter (respects the
 *    user's timezone preference — no raw GMT offset);
 *  - whether the incoming handoff notes have been acknowledged, from the
 *    command-center shift-notes endpoint.
 *
 * Tabular-nums prevents digit jitter as the clock ticks.
 */
export function HandoffCountdown({ acknowledged, acknowledgedAt }: HandoffStatusProps) {
  const { formatTimestamp } = useFormatters();
  const [nowIso, setNowIso] = useState<string>(() => new Date().toISOString());

  useEffect(() => {
    const tick = () => setNowIso(new Date().toISOString());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      className="hidden md:flex items-center gap-2 text-xs text-muted-foreground tabular-nums"
      aria-label="Current time and shift handoff status"
    >
      <span>{formatTimestamp(nowIso, CLOCK_FORMAT)}</span>
      <span className="text-muted-foreground/40">·</span>
      {acknowledged ? (
        <span className="flex items-center gap-1 text-foreground">
          <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" aria-hidden />
          Handoff acknowledged
          {acknowledgedAt && (
            <span className="text-muted-foreground">· {formatTimestamp(acknowledgedAt, TIME_FORMAT)}</span>
          )}
        </span>
      ) : (
        <span className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
          <CircleDot className="h-3 w-3" aria-hidden />
          Handoff pending
        </span>
      )}
    </div>
  );
}
