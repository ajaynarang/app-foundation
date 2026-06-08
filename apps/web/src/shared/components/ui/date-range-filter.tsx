'use client';

import { useState, useCallback, useEffect } from 'react';
import { CalendarIcon } from 'lucide-react';
import { subDays } from 'date-fns';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { DISPLAY_FORMATS } from '@/shared/lib/utils/date-utils';
import { Button } from '@/shared/components/ui/button';
import { Calendar } from '@/shared/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover';
import { Separator } from '@/shared/components/ui/separator';

export interface DateRangePresetOption {
  value: string;
  label: string;
  getRange: () => { from: string; to: string };
}

function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function daysAgoRange(days: number): { from: string; to: string } {
  const today = new Date();
  return { from: toDateStr(subDays(today, days)), to: toDateStr(today) };
}

/**
 * Get the Monday of the week containing the given date (Monday-Sunday weeks).
 */
function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? 6 : day - 1; // Sunday → go back 6 days
  d.setDate(d.getDate() - diff);
  return d;
}

export const HISTORY_PRESETS: DateRangePresetOption[] = [
  { value: 'today', label: 'Today', getRange: () => daysAgoRange(0) },
  { value: '7d', label: 'Last 7 days', getRange: () => daysAgoRange(7) },
  { value: '30d', label: 'Last 30 days', getRange: () => daysAgoRange(30) },
  { value: '90d', label: 'Last 90 days', getRange: () => daysAgoRange(90) },
];

export const PERIOD_PRESETS: DateRangePresetOption[] = [
  {
    value: 'this-week',
    label: 'This Week',
    getRange: () => {
      const today = new Date();
      const monday = getMonday(today);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { from: toDateStr(monday), to: toDateStr(sunday) };
    },
  },
  {
    value: 'last-week',
    label: 'Last Week',
    getRange: () => {
      const today = new Date();
      const thisMonday = getMonday(today);
      const lastMonday = new Date(thisMonday);
      lastMonday.setDate(thisMonday.getDate() - 7);
      const lastSunday = new Date(lastMonday);
      lastSunday.setDate(lastMonday.getDate() + 6);
      return { from: toDateStr(lastMonday), to: toDateStr(lastSunday) };
    },
  },
  {
    value: 'this-month',
    label: 'This Month',
    getRange: () => {
      const today = new Date();
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { from: toDateStr(firstDay), to: toDateStr(lastDay) };
    },
  },
];

interface DateRangeFilterProps {
  dateFrom?: string;
  dateTo?: string;
  defaultPreset?: string;
  presets?: DateRangePresetOption[];
  /** Hide the Custom date picker option (useful on mobile-only views) */
  hideCustom?: boolean;
  onChange: (from: string | undefined, to: string | undefined) => void;
}

function detectPreset(presets: DateRangePresetOption[], dateFrom?: string, dateTo?: string): string | null {
  if (!dateFrom || !dateTo) return null;
  for (const p of presets) {
    const range = p.getRange();
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
    const from = formatCalendarDate(dateFrom, DISPLAY_FORMATS.COMPACT);
    const to = formatCalendarDate(dateTo, DISPLAY_FORMATS.COMPACT);
    return `${from} – ${to}`;
  }
  if (dateFrom) return `From ${formatCalendarDate(dateFrom, DISPLAY_FORMATS.COMPACT)}`;
  if (dateTo) return `To ${formatCalendarDate(dateTo, DISPLAY_FORMATS.COMPACT)}`;
  return 'Date range';
}

export function DateRangeFilter({
  dateFrom,
  dateTo,
  defaultPreset,
  presets = HISTORY_PRESETS,
  hideCustom,
  onChange,
}: DateRangeFilterProps) {
  const { formatCalendarDate } = useFormatters();
  const [open, setOpen] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>(() => {
    const detected = detectPreset(presets, dateFrom, dateTo);
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
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePreset = useCallback(
    (presetValue: string) => {
      if (presetValue === 'custom') {
        setActivePreset('custom');
        setShowCustom(true);
        return;
      }
      const match = presets.find((p) => p.value === presetValue);
      if (!match) return;
      const range = match.getRange();
      setActivePreset(presetValue);
      setShowCustom(false);
      onChange(range.from, range.to);
      setOpen(false);
    },
    [presets, onChange],
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

  const label = getDisplayLabel(activePreset, presets, dateFrom, dateTo, formatCalendarDate);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="text-xs">
          <CalendarIcon className="mr-1.5 h-3 w-3" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <div className="flex flex-col gap-1.5">
          {presets.map((p) => (
            <Button
              key={p.value}
              variant={activePreset === p.value ? 'default' : 'ghost'}
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
                variant={activePreset === 'custom' ? 'default' : 'ghost'}
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
