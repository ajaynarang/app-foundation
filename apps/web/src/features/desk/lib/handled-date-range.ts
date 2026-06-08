import type { HandledWindow } from '../types';

/**
 * Human-readable label for a Handled window preset. Used by the toolbar
 * dropdown and the summary strip so both surfaces agree on phrasing.
 */
export const HANDLED_WINDOW_LABELS: Record<HandledWindow, string> = {
  today: 'Today',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  this_month: 'This month',
  custom: 'Custom',
};

export const HANDLED_WINDOW_OPTIONS: Array<{ value: HandledWindow; label: string }> = [
  { value: 'today', label: HANDLED_WINDOW_LABELS.today },
  { value: '7d', label: HANDLED_WINDOW_LABELS['7d'] },
  { value: '30d', label: HANDLED_WINDOW_LABELS['30d'] },
  { value: 'this_month', label: HANDLED_WINDOW_LABELS.this_month },
  { value: 'custom', label: HANDLED_WINDOW_LABELS.custom },
];

/**
 * Convert an `<input type="date">` value (local YYYY-MM-DD) to an ISO
 * datetime string. `isEnd=true` anchors to 23:59:59.999 local time so
 * "from 2026-04-01 to 2026-04-03" spans three full local days. Backend
 * still normalizes to tenant timezone, but we send an ISO string the
 * `z.string().datetime()` schema accepts.
 */
export function localDateInputToISO(dateStr: string, isEnd = false): string | undefined {
  if (!dateStr) return undefined;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return undefined;
  if (isEnd) {
    d.setHours(23, 59, 59, 999);
  } else {
    d.setHours(0, 0, 0, 0);
  }
  return d.toISOString();
}

/**
 * Validate a custom range — `from <= to` and both parse. Used by the
 * Apply button in the inline range picker to gate commits.
 */
export function isValidCustomRange(from: string | undefined, to: string | undefined): boolean {
  if (!from || !to) return false;
  const f = new Date(from);
  const t = new Date(to);
  if (Number.isNaN(f.getTime()) || Number.isNaN(t.getTime())) return false;
  return f.getTime() <= t.getTime();
}
