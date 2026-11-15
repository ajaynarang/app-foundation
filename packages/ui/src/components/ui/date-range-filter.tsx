'use client';

import { useState, useCallback, useEffect } from 'react';
import { CalendarIcon } from 'lucide-react';
import { CALENDAR_DATE_COMPACT } from '../../lib/calendar-date';
import { usePageChrome } from '../page-chrome/page-chrome-context';
import { Button } from './button';
import { Calendar } from './calendar';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Separator } from './separator';
import { HISTORY_PRESETS, PERIOD_PRESETS, toDateStr, type DateRangePresetOption } from '../../lib/date-range-presets';

export { HISTORY_PRESETS, PERIOD_PRESETS, type DateRangePresetOption };

interface DateRangeFilterProps {
  dateFrom?: string;
  dateTo?: string;
  defaultPreset?: string;
  presets?: DateRangePresetOption[];
  /** Hide the Custom date picker option (useful on mobile-only views) */
  hideCustom?: boolean;
  /**
   * Offer "All time" (no bounds) as the first option. The control is then fully driven by
   * `dateFrom` / `dateTo` — it always shows the value it was given, so a parent can change the
   * range (a pivot's default window, "Clear") and the label follows. Used by product lists.
   *
   * In this mode "today" is today's date in the user's PREFERENCE timezone — the zone
   * `useListParams` turns the days into instants with — not the browser's local date.
   */
  allTime?: boolean;
  /**
   * `preset` is the picked preset's value ("7d") when the range came from a preset, so a list
   * can keep "last 7 days" relative in its URL instead of freezing today's dates.
   */
  onChange: (from: string | undefined, to: string | undefined, preset?: string) => void;
}

const ALL_TIME_PRESET = 'all';
const ALL_TIME_LABEL = 'All time';
const ALL_TIME_SHORT_LABEL = 'All';

function detectPreset(
  presets: DateRangePresetOption[],
  dateFrom?: string,
  dateTo?: string,
  today?: string,
): string | null {
  if (!dateFrom || !dateTo) return null;
  for (const p of presets) {
    const range = p.getRange(today);
    if (dateFrom === range.from && dateTo === range.to) return p.value;
  }
  return null;
}

function getDisplayLabel(
  preset: string | null,
  presets: DateRangePresetOption[],
  dateFrom: string | undefined,
  dateTo: string | undefined,
  formatCalendarDate: (dateStr: string | null | undefined, fmt?: string) => string,
): string {
  if (preset && preset !== 'custom') {
    const match = presets.find((p) => p.value === preset);
    if (match) return match.label;
  }
  if (dateFrom && dateTo) {
    const from = formatCalendarDate(dateFrom, CALENDAR_DATE_COMPACT);
    const to = formatCalendarDate(dateTo, CALENDAR_DATE_COMPACT);
    return `${from} – ${to}`;
  }
  if (dateFrom) return `From ${formatCalendarDate(dateFrom, CALENDAR_DATE_COMPACT)}`;
  if (dateTo) return `To ${formatCalendarDate(dateTo, CALENDAR_DATE_COMPACT)}`;
  return 'Date range';
}

export function DateRangeFilter({
  dateFrom,
  dateTo,
  defaultPreset,
  presets = HISTORY_PRESETS,
  hideCustom,
  allTime = false,
  onChange,
}: DateRangeFilterProps) {
  const { formatCalendarDate, timezone, calendarDateToday } = usePageChrome();
  // Product lists (`allTime`) read "today" in the preference timezone; other callers keep the browser's date.
  const today = allTime ? calendarDateToday(timezone) : undefined;
  const [open, setOpen] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>(() => {
    const detected = detectPreset(presets, dateFrom, dateTo, today);
    if (detected) return detected;
    if (dateFrom || dateTo) return 'custom';
    return defaultPreset ?? null;
  });
  const [showCustom, setShowCustom] = useState(activePreset === 'custom');

  // Apply default preset on mount if no dates are set
  useEffect(() => {
    if (!dateFrom && !dateTo && defaultPreset && defaultPreset !== 'custom') {
      const match = presets.find((p) => p.value === defaultPreset);
      if (match) {
        const range = match.getRange();
        setActivePreset(defaultPreset);
        onChange(range.from, range.to);
      }
    }
    // Only on mount: the default preset applies once, never again when the parent's dates change.
  }, []);

  const hasDates = Boolean(dateFrom || dateTo);
  const detectedPreset = detectPreset(presets, dateFrom, dateTo, today);
  // With `allTime` the highlighted option is derived from the dates, never from local state.
  const currentPreset = !allTime
    ? activePreset
    : showCustom
      ? 'custom'
      : (detectedPreset ?? (hasDates ? 'custom' : ALL_TIME_PRESET));

  const handleOpenChange = (next: boolean) => {
    if (next && allTime) setShowCustom(hasDates && !detectedPreset);
    setOpen(next);
  };

  const handlePreset = useCallback(
    (presetValue: string) => {
      if (presetValue === ALL_TIME_PRESET) {
        setActivePreset(null);
        setShowCustom(false);
        onChange(undefined, undefined);
        setOpen(false);
        return;
      }
      if (presetValue === 'custom') {
        setActivePreset('custom');
        setShowCustom(true);
        return;
      }
      const match = presets.find((p) => p.value === presetValue);
      if (!match) return;
      const range = match.getRange(today);
      setActivePreset(presetValue);
      setShowCustom(false);
      onChange(range.from, range.to, presetValue);
      setOpen(false);
    },
    [presets, onChange, today],
  );

  const handleCustomFrom = useCallback(
    (date: Date | undefined) => {
      setActivePreset('custom');
      onChange(date ? toDateStr(date) : undefined, dateTo);
    },
    [dateTo, onChange],
  );

  const handleCustomTo = useCallback(
    (date: Date | undefined) => {
      setActivePreset('custom');
      onChange(dateFrom, date ? toDateStr(date) : undefined);
    },
    [dateFrom, onChange],
  );

  const shownPreset = allTime ? detectedPreset : activePreset;
  const label =
    allTime && !hasDates ? ALL_TIME_LABEL : getDisplayLabel(shownPreset, presets, dateFrom, dateTo, formatCalendarDate);
  // Below `lg` the trigger collapses to icon + the value alone ("30d", "All"); the full text stays in the tooltip.
  const shortLabel =
    allTime && !hasDates ? ALL_TIME_SHORT_LABEL : (presets.find((p) => p.value === shownPreset)?.shortLabel ?? label);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="text-xs" aria-label={`Date range: ${label}`} title={label}>
          <CalendarIcon className="mr-1.5 h-3 w-3" aria-hidden="true" />
          <span className="hidden lg:inline">{label}</span>
          <span className="lg:hidden">{shortLabel}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <div className="flex flex-col gap-1.5">
          {allTime && (
            <Button
              variant={currentPreset === ALL_TIME_PRESET ? 'default' : 'ghost'}
              size="sm"
              className="justify-start text-xs"
              onClick={() => handlePreset(ALL_TIME_PRESET)}
            >
              {ALL_TIME_LABEL}
            </Button>
          )}
          {presets.map((p) => (
            <Button
              key={p.value}
              variant={currentPreset === p.value ? 'default' : 'ghost'}
              size="sm"
              className="justify-start text-xs"
              onClick={() => handlePreset(p.value)}
            >
              {p.label}
            </Button>
          ))}
          {!hideCustom && (
            <>
              <Separator className="my-1" />
              <Button
                variant={currentPreset === 'custom' ? 'default' : 'ghost'}
                size="sm"
                className="justify-start text-xs"
                onClick={() => handlePreset('custom')}
              >
                Custom
              </Button>
            </>
          )}
        </div>

        {showCustom && !hideCustom && (
          <div className="mt-3 space-y-3">
            <Separator />
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">From</p>
              <Calendar
                mode="single"
                selected={dateFrom ? new Date(dateFrom + 'T00:00:00') : undefined}
                onSelect={handleCustomFrom}
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">To</p>
              <Calendar
                mode="single"
                selected={dateTo ? new Date(dateTo + 'T00:00:00') : undefined}
                onSelect={handleCustomTo}
              />
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
