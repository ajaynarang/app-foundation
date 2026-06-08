'use client';

import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { cn } from '@sally/ui';

function formatShortDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatDiff(diffMs: number): string {
  const absMs = Math.abs(diffMs);
  const h = Math.floor(absMs / (1000 * 60 * 60));
  const m = Math.floor((absMs % (1000 * 60 * 60)) / (1000 * 60));
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

interface Props {
  estimatedArrival: string;
  deliveryWindowStart?: string;
  deliveryWindowEnd?: string;
}

type Verdict = 'on_time' | 'at_risk' | 'late';

const AT_RISK_THRESHOLD_MS = 30 * 60 * 1000; // 30 min buffer

export function EtaVerdictBanner({ estimatedArrival, deliveryWindowEnd }: Props) {
  const etaMs = new Date(estimatedArrival).getTime();
  const now = Date.now();

  let verdict: Verdict = 'on_time';
  let message = '';

  if (deliveryWindowEnd) {
    const windowEndMs = new Date(deliveryWindowEnd).getTime();
    const diff = windowEndMs - etaMs; // positive = early/on time

    if (etaMs > windowEndMs) {
      // ETA is past the window end — late
      verdict = 'late';
      const overMs = etaMs - windowEndMs;
      message = `Late — ETA ${formatShortDateTime(estimatedArrival)}, window closed ${formatDiff(overMs)} ago`;
    } else if (diff < AT_RISK_THRESHOLD_MS) {
      // Less than 30 min margin — at risk
      verdict = 'at_risk';
      message = `ETA at risk — arrival ${formatShortDateTime(estimatedArrival)}, window closes ${formatShortDateTime(deliveryWindowEnd)}`;
    } else {
      // Comfortable margin — on time
      verdict = 'on_time';
      message = `ETA: ${formatShortDateTime(estimatedArrival)} — ${formatDiff(diff)} early ✓`;
    }
  } else {
    // No window — just show ETA
    verdict = etaMs < now ? 'late' : 'on_time';
    message = `ETA: ${formatShortDateTime(estimatedArrival)}`;
  }

  const styles: Record<Verdict, string> = {
    on_time:
      'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300',
    at_risk: 'bg-caution/10 border-caution/30 text-caution',
    late: 'bg-critical/10 border-critical/30 text-critical',
  };

  const Icon = verdict === 'on_time' ? CheckCircle2 : verdict === 'at_risk' ? AlertTriangle : XCircle;

  return (
    <div
      className={cn('flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium', styles[verdict])}
      role="status"
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate">{message}</span>
    </div>
  );
}
