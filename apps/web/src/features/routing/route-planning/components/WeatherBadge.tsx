'use client';

import type { WeatherAlert } from '@/features/routing/route-planning';

interface WeatherBadgeProps {
  weatherAlerts?: WeatherAlert[];
  compact?: boolean;
}

const CONDITION_ICONS: Record<string, string> = {
  snow: '❄',
  ice: '🧊',
  rain: '🌧',
  thunderstorm: '⛈',
  fog: '🌫',
  clear: '☀',
};

/**
 * Compact inline weather badge showing the worst condition + drive time impact.
 * Shared between dispatcher SegmentTimeline and driver TripTimeline.
 */
export function WeatherBadge({ weatherAlerts, compact }: WeatherBadgeProps) {
  if (!weatherAlerts?.length) return null;

  // Find worst alert (highest multiplier)
  const worst = weatherAlerts.reduce((prev, curr) =>
    curr.driveTimeMultiplier > prev.driveTimeMultiplier ? curr : prev,
  );

  // Only show if there's actual impact (multiplier > 1.0)
  if (worst.driveTimeMultiplier <= 1.0) return null;

  const icon = CONDITION_ICONS[worst.condition] ?? '⚠';
  const impactPercent = Math.round((worst.driveTimeMultiplier - 1) * 100);
  const severityClass =
    worst.severity === 'severe'
      ? 'bg-critical/10 text-critical border-critical/20'
      : 'bg-caution/10 text-caution border-caution/20';

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-medium ${severityClass}`}>
        {icon} +{impactPercent}%
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-medium ${severityClass}`}
    >
      {icon} {worst.condition.charAt(0).toUpperCase() + worst.condition.slice(1)} +{impactPercent}%
    </span>
  );
}
