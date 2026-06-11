'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { CONTACTS, mailto } from '@/shared/lib/contacts';

export interface MaintenanceState {
  enabled: boolean;
  reason?: string;
  message?: string;
  estimatedEndTime?: string; // ISO 8601 string or "HH:MM" with timezone field
  timezone?: string;
  startedAt?: string;
}

/**
 * Parse estimated end time into a Date object.
 *
 * Supports two formats:
 * - ISO 8601: "2026-04-09T12:00:00Z" (emergency maintenance via CLI)
 * - "HH:MM" with timezone: scheduled maintenance. Uses Intl.DateTimeFormat
 *   to resolve the target time in the maintenance timezone, then converts
 *   to a local Date for the countdown.
 */
function parseEndTime(estimatedEndTime: string | undefined, timezone: string | undefined): Date | null {
  if (!estimatedEndTime) return null;

  // ISO format (emergency maintenance via CLI)
  if (estimatedEndTime.includes('T') || estimatedEndTime.includes('-')) {
    const date = new Date(estimatedEndTime);
    return isNaN(date.getTime()) ? null : date;
  }

  // "HH:MM" format (scheduled maintenance)
  const [hours, minutes] = estimatedEndTime.split(':').map(Number);
  if (isNaN(hours) || isNaN(minutes)) return null;

  // Resolve "HH:MM in timezone" to a UTC timestamp using Intl
  const tz = timezone || 'America/New_York';
  const now = new Date();

  // Build a candidate date for "today at HH:MM in tz"
  // Use the formatter to figure out the current time in the target timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const currentTzHour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const currentTzMinute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  const currentTzMinutes = currentTzHour * 60 + currentTzMinute;
  const targetTzMinutes = hours * 60 + minutes;

  // Calculate how many minutes until the target time
  let diffMinutes = targetTzMinutes - currentTzMinutes;
  if (diffMinutes <= 0) diffMinutes += 24 * 60; // Next day

  return new Date(now.getTime() + diffMinutes * 60_000);
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'any moment now';

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

export function MaintenanceClient({ initialState }: { initialState: MaintenanceState | null }) {
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);

  const state = initialState;
  const endTime = useMemo(
    () => parseEndTime(state?.estimatedEndTime, state?.timezone),
    [state?.estimatedEndTime, state?.timezone],
  );

  // Countdown timer
  useEffect(() => {
    if (!endTime) return;

    const tick = () => {
      const remaining = endTime.getTime() - Date.now();
      setTimeLeft(Math.max(0, remaining));
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [endTime]);

  // Auto-check when countdown reaches zero — poll every 30s
  const checkStatus = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch('/api/maintenance-status', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (!data.enabled) {
          // Backend is back — reload the page to go through middleware
          window.location.href = '/';
          return;
        }
      }
    } catch {
      // Still down — will retry
    }
    setChecking(false);
  }, []);

  useEffect(() => {
    if (timeLeft !== null && timeLeft <= 0) {
      // Poll every 30s once countdown hits zero
      checkStatus();
      const interval = setInterval(checkStatus, 30_000);
      return () => clearInterval(interval);
    }
  }, [timeLeft, checkStatus]);

  // Emergency maintenance (no end time) — poll every 60s
  useEffect(() => {
    if (endTime) return; // Countdown-based polling handles that case
    const interval = setInterval(checkStatus, 60_000);
    return () => clearInterval(interval);
  }, [endTime, checkStatus]);

  const message = state?.message || 'We\u2019re performing maintenance. We\u2019ll be back shortly.';

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground px-6">
      <div className="text-center max-w-lg">
        {/* Brand logo */}
        <div className="text-3xl font-bold tracking-tight mb-8">Platform</div>

        {/* Pulsing dot indicator */}
        <div className="mx-auto mb-6 flex items-center justify-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-sky-500" />
          </span>
          <span className="text-sm font-medium text-muted-foreground uppercase tracking-widest">Maintenance</span>
        </div>

        {/* Message */}
        <p className="text-lg text-muted-foreground mb-8">{message}</p>

        {/* Countdown */}
        {endTime && timeLeft !== null && (
          <div className="mb-8">
            {timeLeft > 0 ? (
              <>
                <div className="text-4xl font-mono font-bold tracking-wider mb-2">{formatCountdown(timeLeft)}</div>
                <p className="text-sm text-muted-foreground/60">
                  Expected back by{' '}
                  {endTime.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    timeZoneName: 'short',
                  })}
                </p>
              </>
            ) : (
              <div className="flex items-center justify-center gap-2 text-sky-400">
                {checking ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    <span>Checking if we&apos;re back...</span>
                  </>
                ) : (
                  <span>Should be back any moment now...</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* No countdown for emergency maintenance */}
        {!endTime && (
          <div className="mb-8 text-sm text-muted-foreground/60">
            We don&apos;t have an estimated time yet. This page will automatically refresh when we&apos;re back.
          </div>
        )}

        {/* Contact info */}
        <div className="border-t border-border pt-6 mt-6">
          <p className="text-xs text-muted-foreground/40">
            Need help?{' '}
            <a
              href={mailto('support')}
              className="text-muted-foreground/60 hover:text-muted-foreground underline underline-offset-2"
            >
              {CONTACTS.support}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
