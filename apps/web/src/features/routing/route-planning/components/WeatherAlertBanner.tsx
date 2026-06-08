'use client';

import type { RouteSegment, WeatherAlert } from '../types';

interface WeatherAlertBannerProps {
  segments: RouteSegment[];
}

function getWorstAlert(segments: RouteSegment[]): (WeatherAlert & { segmentLocation?: string }) | null {
  let worst: (WeatherAlert & { segmentLocation?: string }) | null = null;

  for (const seg of segments) {
    if (!seg.weatherAlerts) continue;
    for (const alert of seg.weatherAlerts) {
      if (alert.severity !== 'moderate' && alert.severity !== 'severe') continue;
      if (!worst || alert.severity === 'severe' || (alert.severity === 'moderate' && worst.severity !== 'severe')) {
        worst = { ...alert, segmentLocation: seg.toLocation };
      }
    }
  }

  return worst;
}

export function WeatherAlertBanner({ segments }: WeatherAlertBannerProps) {
  const alert = getWorstAlert(segments);

  if (!alert) return null;

  const isSevere = alert.severity === 'severe';
  const driveImpact = alert.driveTimeMultiplier > 1 ? `+${Math.round((alert.driveTimeMultiplier - 1) * 100)}%` : null;

  const location = alert.segmentLocation?.split(',')[0] || 'route';

  return (
    <div
      className={`flex items-start gap-2 px-4 py-2.5 rounded-md text-sm ${
        isSevere
          ? 'bg-critical/10 border border-critical/20 text-critical'
          : 'bg-caution/10 border border-caution/20 text-caution'
      }`}
    >
      <span className="flex-shrink-0 mt-0.5 text-base">{isSevere ? '\u26A0\uFE0F' : '\u26A0'}</span>
      <span className="text-muted-foreground">
        <strong className={isSevere ? 'text-critical' : 'text-caution'}>
          {isSevere ? 'Severe' : 'Moderate'} weather:
        </strong>{' '}
        {alert.condition} near {location}.{driveImpact && ` Drive time ${driveImpact}.`}
      </span>
    </div>
  );
}
