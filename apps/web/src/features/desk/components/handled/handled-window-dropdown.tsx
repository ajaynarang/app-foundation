'use client';

import { useState } from 'react';

import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';

import { HANDLED_WINDOW_OPTIONS, isValidCustomRange, localDateInputToISO } from '../../lib/handled-date-range';
import type { HandledWindow } from '../../types';

interface HandledWindowDropdownProps {
  value: HandledWindow;
  from?: string;
  to?: string;
  onChange: (next: { window: HandledWindow; from?: string; to?: string }) => void;
}

/**
 * Window preset selector for the Handled toolbar. When the user picks
 * "Custom", a popover with two native date inputs appears; commit is
 * gated on `from <= to`. Everything else is a single-click preset.
 * All state flows back to the toolbar via `onChange` — the dropdown is
 * stateful only for the un-committed custom range.
 */
export function HandledWindowDropdown({ value, from, to, onChange }: HandledWindowDropdownProps) {
  const [customOpen, setCustomOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState<string>(toInputDate(from));
  const [draftTo, setDraftTo] = useState<string>(toInputDate(to));

  const handleSelect = (next: HandledWindow) => {
    if (next === 'custom') {
      setCustomOpen(true);
      return;
    }
    onChange({ window: next, from: undefined, to: undefined });
  };

  const handleApply = () => {
    const fromISO = localDateInputToISO(draftFrom);
    const toISO = localDateInputToISO(draftTo, true);
    if (!fromISO || !toISO) return;
    onChange({ window: 'custom', from: fromISO, to: toISO });
    setCustomOpen(false);
  };

  const canApply = isValidCustomRange(draftFrom, draftTo);

  return (
    <div className="flex items-center gap-2">
      <Select value={value} onValueChange={(v) => handleSelect(v as HandledWindow)}>
        <SelectTrigger className="h-8 w-40 text-xs" aria-label="Time window">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {HANDLED_WINDOW_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {value === 'custom' && (
        <Popover open={customOpen} onOpenChange={setCustomOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs">
              {from && to ? `${toInputDate(from)} → ${toInputDate(to)}` : 'Pick range'}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 space-y-3 p-3">
            <div className="space-y-2">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                <span>From</span>
                <Input type="date" value={draftFrom} onChange={(e) => setDraftFrom(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                <span>To</span>
                <Input type="date" value={draftTo} onChange={(e) => setDraftTo(e.target.value)} />
              </label>
              {!canApply && (draftFrom || draftTo) && (
                <p className="text-[11px] text-destructive">From must be on or before To.</p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => setCustomOpen(false)}>
                Cancel
              </Button>
              <Button type="button" size="sm" disabled={!canApply} onClick={handleApply}>
                Apply
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

/**
 * Convert an ISO string to `YYYY-MM-DD` (local) for the native date
 * input. Returns '' for missing values so the input renders placeholder.
 */
function toInputDate(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
