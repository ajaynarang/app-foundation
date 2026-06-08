'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Car, Coffee, Fuel, MapPin, Moon, Navigation2, Package } from 'lucide-react';
import { cn } from '@sally/ui';
import { Button } from '@sally/ui/components/ui/button';
import { Progress } from '@sally/ui/components/ui/progress';
import { useNavigationPicker, NavigationAppPicker } from '@/features/fleet/drivers/components/NavigationAppPicker';
import { StopActionInline } from './StopActionInline';
import { DocUploadInline } from './DocUploadInline';
import { WeatherBadge } from '@/features/routing/route-planning/components/WeatherBadge';
import { stopHasPrimaryDoc } from '../lib/stop-docs';
import { STOP_STATUS, STOP_ACTION, SEGMENT_TYPE } from '../lib/constants';
import { formatDurationHours } from '@/shared/lib/format-time';
import { formatETA } from '../lib/route-state';
import type { RouteSegment, RoutePlanResult } from '@/features/routing/route-planning';
import type { Load, LoadStop } from '@/features/fleet/loads/types';

// ─── Segment variant config ────────────────────────────────────────────────────

interface VariantStyle {
  gradient: string;
  borderColor: string;
  accentColor: string;
}

function getVariantStyle(segment: RouteSegment): VariantStyle {
  const type = segment.segmentType;
  const action = segment.actionType;

  if (type === SEGMENT_TYPE.DOCK && action === STOP_ACTION.DELIVERY) {
    return {
      gradient: 'bg-gradient-to-br from-red-400/5 to-red-400/[0.01]',
      borderColor: 'border-red-400/20',
      accentColor: '#f87171',
    };
  }
  if (type === 'dock') {
    return {
      gradient: 'bg-gradient-to-br from-emerald-500/5 to-emerald-500/[0.01]',
      borderColor: 'border-emerald-500/20',
      accentColor: '#4ade80',
    };
  }

  const variants: Record<string, VariantStyle> = {
    drive: {
      gradient: 'bg-gradient-to-br from-blue-500/5 to-blue-500/[0.01]',
      borderColor: 'border-blue-500/20',
      accentColor: '#7c8aff',
    },
    fuel: {
      gradient: 'bg-gradient-to-br from-amber-500/5 to-amber-500/[0.01]',
      borderColor: 'border-amber-500/20',
      accentColor: '#f59e0b',
    },
    break: {
      gradient: 'bg-gradient-to-br from-green-600/5 to-green-600/[0.01]',
      borderColor: 'border-green-600/20',
      accentColor: '#16a34a',
    },
    rest: {
      gradient: 'bg-gradient-to-br from-violet-500/5 to-violet-500/[0.01]',
      borderColor: 'border-violet-500/20',
      accentColor: '#8b5cf6',
    },
  };

  return variants[type] ?? variants.drive;
}

// ─── Timer hook for break/rest ──────────────────────────────────────────────────

function useCountdown(targetIso: string | undefined) {
  const [remainingMs, setRemainingMs] = useState(() => {
    if (!targetIso) return 0;
    return Math.max(0, new Date(targetIso).getTime() - Date.now());
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!targetIso) return;
    const target = new Date(targetIso).getTime();

    const tick = () => {
      const ms = Math.max(0, target - Date.now());
      setRemainingMs(ms);
      if (ms <= 0 && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [targetIso]);

  return remainingMs;
}

function formatCountdown(ms: number, long?: boolean): string {
  if (ms <= 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');

  if (long || h > 0) {
    return `${h}:${pad(m)}:${pad(s)}`;
  }
  return `${m}:${pad(s)}`;
}

// ─── Meta item ─────────────────────────────────────────────────────────────────

function MetaItem({ label, value, dotColor }: { label: string; value: string; dotColor?: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {dotColor && <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: dotColor }} />}
      <span>{label}:</span>
      <span className="text-foreground font-medium">{value}</span>
    </div>
  );
}

// ─── Props ─────────────────────────────────────────────────────────────────────

interface SegmentHeroCardProps {
  segment: RouteSegment;
  load: Load;
  plan?: RoutePlanResult;
  matchingStop?: LoadStop;
  driveHoursRemaining?: number;
  onNavigate?: (name: string, lat: number, lon: number) => void;
  onStopAction?: (action: string) => void;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function SegmentHeroCard({
  segment,
  load,
  matchingStop,
  driveHoursRemaining,
  onStopAction,
}: SegmentHeroCardProps) {
  const { navigate, pickerProps } = useNavigationPicker();
  const [docUploadDismissed, setDocUploadDismissed] = useState(false);

  const style = getVariantStyle(segment);
  const segType = segment.segmentType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const _status = (segment as any).status as string | undefined;

  // Timer for break/rest
  const remainingMs = useCountdown(
    segType === SEGMENT_TYPE.BREAK || segType === SEGMENT_TYPE.REST ? segment.estimatedDeparture : undefined,
  );
  const timerDone = remainingMs <= 0;

  // Progress for drive segments — populated by real-time GPS tracking when available
  const progressPercent: number | undefined = undefined; // TODO: wire to GPS tracking data

  const handleNavigate = useCallback(() => {
    if (segment.toLat != null && segment.toLon != null) {
      navigate(segment.toLocation || '', segment.toLat, segment.toLon);
    }
  }, [navigate, segment.toLat, segment.toLon, segment.toLocation]);

  // ─── Dock segment (pickup or delivery) ───────────────────────────────────

  if (segType === SEGMENT_TYPE.DOCK) {
    const isDelivery = segment.actionType === STOP_ACTION.DELIVERY;
    const isPickup = segment.actionType === STOP_ACTION.PICKUP;
    const stopStatus = matchingStop?.status;
    const isLoading = stopStatus === STOP_STATUS.IN_PROGRESS;
    const isArrived = stopStatus === STOP_STATUS.ARRIVED;
    const _hasPrimaryDoc = matchingStop ? stopHasPrimaryDoc(matchingStop) : false;

    const Icon = isDelivery ? Package : MapPin;
    const title = matchingStop?.stopName || segment.toLocation || (isDelivery ? 'Delivery' : 'Pickup');
    const subtitle = segment.customerName || '';
    const statusLabel = isLoading ? (isDelivery ? 'Unloading' : 'Loading') : isArrived ? 'Arrived' : 'En Route';

    return (
      <>
        <div className={cn('rounded-xl border overflow-hidden', style.gradient, style.borderColor)}>
          <div className="p-4 space-y-3">
            {/* Header */}
            <div className="flex items-start gap-3">
              <div
                className="h-10 w-10 rounded-[10px] flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${style.accentColor}15`, border: `1.5px solid ${style.accentColor}30` }}
              >
                <Icon className="h-5 w-5" style={{ color: style.accentColor }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{title}</p>
                {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
              </div>
            </div>

            {/* Meta grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              <MetaItem
                label="Status"
                value={statusLabel}
                dotColor={isLoading ? style.accentColor : isArrived ? style.accentColor : undefined}
              />
              {segment.dockDurationHours != null && (
                <MetaItem label="Dock Time" value={formatDurationHours(segment.dockDurationHours)} />
              )}
              {(matchingStop?.earliestArrival || matchingStop?.latestArrival) && (
                <MetaItem
                  label="Window"
                  value={
                    matchingStop.earliestArrival && matchingStop.latestArrival
                      ? `${matchingStop.earliestArrival} - ${matchingStop.latestArrival}`
                      : matchingStop.earliestArrival
                        ? `After ${matchingStop.earliestArrival}`
                        : `Before ${matchingStop.latestArrival}`
                  }
                />
              )}
            </div>

            {/* Navigate — full button when en route, subtle link when arrived/loading */}
            {segment.toLat != null &&
              segment.toLon != null &&
              (!isArrived && !isLoading ? (
                <Button className="w-full h-11 min-h-[3.4rem] text-sm font-semibold" onClick={handleNavigate}>
                  Navigate to {isDelivery ? 'Delivery' : 'Pickup'} →
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs text-muted-foreground"
                  onClick={handleNavigate}
                >
                  <Navigation2 className="h-3 w-3 mr-1" />
                  Open in Maps
                </Button>
              ))}

            {/* Doc upload inline — show during loading/unloading */}
            {isLoading &&
              !docUploadDismissed &&
              load?.loadNumber &&
              (() => {
                const docStop =
                  matchingStop ??
                  load.stops?.find(
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (s: any) => s.actionType === segment.actionType && s.status !== 'completed',
                  );
                if (!docStop) return null;
                return (
                  <div className="pt-2 border-t border-border/50">
                    <DocUploadInline
                      stopId={String(docStop.id)}
                      loadId={load.loadNumber}
                      documentType={isPickup ? 'BOL' : 'POD'}
                      isAdditional={stopHasPrimaryDoc(docStop)}
                      onUploaded={() => setDocUploadDismissed(true)}
                      onSkip={() => setDocUploadDismissed(true)}
                    />
                  </div>
                );
              })()}

            {/* Stop completion actions (I'm Here → Start Loading → Done) */}
            {load?.loadNumber &&
              (() => {
                // Use matchingStop from TripTimeline, or find by actionType
                // Segment actionType can be 'pickup'/'delivery' (new) or 'dock' (old plans)
                const segAction = segment.actionType;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const stopForAction =
                  matchingStop ??
                  (load.stops as any[])?.find(
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (s: any) => {
                      if (segAction === STOP_ACTION.PICKUP || segAction === STOP_ACTION.DELIVERY) {
                        return s.actionType === segAction && s.status !== STOP_STATUS.COMPLETED;
                      }
                      // Old plans have actionType='dock' — match first non-completed stop
                      return s.status !== STOP_STATUS.COMPLETED;
                    },
                  );
                if (!stopForAction) return null;
                return (
                  <div className="pt-2 border-t border-border/50">
                    <StopActionInline stop={stopForAction} loadId={load.loadNumber} isActive />
                  </div>
                );
              })()}
          </div>
        </div>
        <NavigationAppPicker {...pickerProps} />
      </>
    );
  }

  // ─── Drive segment ───────────────────────────────────────────────────────

  if (segType === SEGMENT_TYPE.DRIVE) {
    const destination = segment.toLocation || 'Destination';
    const subtitle = segment.customerName ? `${segment.customerName}` : undefined;
    const distanceMi = segment.distanceMiles ? Math.round(segment.distanceMiles) : undefined;
    const doneM = progressPercent != null && distanceMi ? Math.round((progressPercent / 100) * distanceMi) : undefined;
    const toGoM = distanceMi != null && doneM != null ? distanceMi - doneM : undefined;

    return (
      <>
        <div className={cn('rounded-xl border overflow-hidden', style.gradient, style.borderColor)}>
          <div className="p-4 space-y-3">
            {/* Header */}
            <div className="flex items-start gap-3">
              <div
                className="h-10 w-10 rounded-[10px] flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${style.accentColor}15`, border: `1.5px solid ${style.accentColor}30` }}
              >
                <Car className="h-5 w-5" style={{ color: style.accentColor }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{destination}</p>
                {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
              </div>
              <Navigation2 className="h-5 w-5 shrink-0 mt-0.5" style={{ color: style.accentColor }} />
            </div>

            {/* Meta */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {distanceMi != null && <MetaItem label="Distance" value={`${distanceMi} mi`} />}
              {segment.estimatedArrival && <MetaItem label="ETA" value={formatETA(segment.estimatedArrival)} />}
              {driveHoursRemaining != null && (
                <MetaItem label="Drive Left" value={formatDurationHours(driveHoursRemaining)} />
              )}
              {segment.driveTimeHours != null && (
                <MetaItem label="Drive Time" value={formatDurationHours(segment.driveTimeHours)} />
              )}
            </div>

            {/* Weather alerts */}
            {segment.weatherAlerts && segment.weatherAlerts.length > 0 && (
              <div className="flex items-center gap-2">
                <WeatherBadge weatherAlerts={segment.weatherAlerts} />
              </div>
            )}

            {/* Progress bar */}
            {progressPercent != null && progressPercent > 0 && (
              <div className="space-y-1.5">
                <Progress value={progressPercent} className="h-1.5" />
                {doneM != null && toGoM != null && (
                  <p className="text-2xs text-muted-foreground tabular-nums">
                    {doneM} mi done · {toGoM} mi to go
                  </p>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-11 min-h-[3.4rem] gap-1.5 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  handleNavigate();
                }}
              >
                <Navigation2 className="h-3.5 w-3.5" />
                Open in Maps
              </Button>
              <Button
                size="sm"
                className="flex-1 h-11 min-h-[3.4rem] text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  onStopAction?.('drive_complete');
                }}
              >
                I&apos;ve Arrived
              </Button>
            </div>
          </div>
        </div>
        <NavigationAppPicker {...pickerProps} />
      </>
    );
  }

  // ─── Fuel segment ────────────────────────────────────────────────────────

  if (segType === SEGMENT_TYPE.FUEL) {
    const stationName = segment.fuelStationName || 'Fuel Stop';
    const location = segment.toLocation || '';

    return (
      <>
        <div className={cn('rounded-xl border overflow-hidden', style.gradient, style.borderColor)}>
          <div className="p-4 space-y-3">
            {/* Header */}
            <div className="flex items-start gap-3">
              <div
                className="h-10 w-10 rounded-[10px] flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${style.accentColor}15`, border: `1.5px solid ${style.accentColor}30` }}
              >
                <Fuel className="h-5 w-5" style={{ color: style.accentColor }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{stationName}</p>
                {location && <p className="text-xs text-muted-foreground truncate">{location}</p>}
              </div>
            </div>

            {/* Meta */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {segment.fuelGallons != null && (
                <MetaItem label="Fuel" value={`~${Math.round(segment.fuelGallons)} gal`} />
              )}
              {segment.detourMiles != null && (
                <MetaItem label="Detour" value={`${segment.detourMiles.toFixed(1)} mi`} />
              )}
              {segment.estimatedArrival && <MetaItem label="ETA" value={formatETA(segment.estimatedArrival)} />}
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-11 min-h-[3.4rem] gap-1.5 text-xs"
                onClick={handleNavigate}
              >
                <Navigation2 className="h-3.5 w-3.5" />
                Navigate to Station
              </Button>
              <Button
                size="sm"
                className="flex-1 h-11 min-h-[3.4rem] text-xs"
                onClick={() => onStopAction?.('fuel_complete')}
              >
                ✓ Fueled Up — Continue
              </Button>
            </div>
          </div>
        </div>
        <NavigationAppPicker {...pickerProps} />
      </>
    );
  }

  // ─── Break segment ───────────────────────────────────────────────────────

  if (segType === SEGMENT_TYPE.BREAK) {
    const durationH = segment.restDurationHours ?? 0.5;
    const totalMs = durationH * 3600 * 1000;
    const progressPct = totalMs > 0 ? Math.max(0, Math.min(100, ((totalMs - remainingMs) / totalMs) * 100)) : 100;

    return (
      <div className={cn('rounded-xl border overflow-hidden', style.gradient, style.borderColor)}>
        <div className="p-4 space-y-3">
          {/* Header */}
          <div className="flex items-start gap-3">
            <div
              className="h-10 w-10 rounded-[10px] flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${style.accentColor}15`, border: `1.5px solid ${style.accentColor}30` }}
            >
              <Coffee className="h-5 w-5" style={{ color: style.accentColor }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">{Math.round(durationH * 60)}-Minute Break</p>
              {segment.restReason && <p className="text-xs text-muted-foreground">{segment.restReason}</p>}
            </div>
          </div>

          {/* Timer */}
          <div className="text-center py-2">
            <p className="text-3xl font-bold tabular-nums text-foreground tracking-wider">
              {formatCountdown(remainingMs)}
            </p>
            <p className="text-2xs text-muted-foreground mt-1">remaining</p>
          </div>

          {/* Progress */}
          <Progress value={progressPct} className="h-1.5" />

          {/* Action */}
          <Button
            className="w-full h-11 min-h-[3.4rem] text-sm"
            disabled={!timerDone}
            onClick={() => onStopAction?.('resume_driving')}
          >
            {timerDone ? 'Resume Driving' : `${formatCountdown(remainingMs)} remaining`}
          </Button>
        </div>
      </div>
    );
  }

  // ─── Rest segment ────────────────────────────────────────────────────────

  if (segType === SEGMENT_TYPE.REST) {
    const durationH = segment.restDurationHours ?? 10;
    const totalMs = durationH * 3600 * 1000;
    const progressPct = totalMs > 0 ? Math.max(0, Math.min(100, ((totalMs - remainingMs) / totalMs) * 100)) : 100;
    const restLabel = segment.toLocation || 'Rest Stop';
    const restSubtitle = segment.restType
      ? `${segment.restType === 'split_8_2' ? 'Split 8/2' : segment.restType === 'split_7_3' ? 'Split 7/3' : 'Full Rest'}`
      : undefined;

    return (
      <div className={cn('rounded-xl border overflow-hidden', style.gradient, style.borderColor)}>
        <div className="p-4 space-y-3">
          {/* Header */}
          <div className="flex items-start gap-3">
            <div
              className="h-10 w-10 rounded-[10px] flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${style.accentColor}15`, border: `1.5px solid ${style.accentColor}30` }}
            >
              <Moon className="h-5 w-5" style={{ color: style.accentColor }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{restLabel}</p>
              {restSubtitle && <p className="text-xs text-muted-foreground">{restSubtitle}</p>}
              {segment.restReason && <p className="text-2xs text-muted-foreground">{segment.restReason}</p>}
            </div>
          </div>

          {/* Timer */}
          <div className="text-center py-2">
            <p className="text-3xl font-bold tabular-nums text-foreground tracking-wider">
              {formatCountdown(remainingMs, true)}
            </p>
            <p className="text-2xs text-muted-foreground mt-1">remaining</p>
          </div>

          {/* Meta */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            <MetaItem label="Duration" value={formatDurationHours(durationH)} />
            {segment.estimatedDeparture && <MetaItem label="Resume" value={formatETA(segment.estimatedDeparture)} />}
          </div>

          {/* Progress */}
          <Progress value={progressPct} className="h-1.5" />

          {/* Action */}
          <Button
            className="w-full h-11 min-h-[3.4rem] text-sm"
            disabled={!timerDone}
            onClick={() => onStopAction?.('resume_driving')}
          >
            {timerDone ? 'Resume Driving' : `${formatCountdown(remainingMs, true)} remaining`}
          </Button>
        </div>
      </div>
    );
  }

  // ─── Fallback ────────────────────────────────────────────────────────────

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{segment.toLocation || 'Unknown segment'}</p>
    </div>
  );
}
