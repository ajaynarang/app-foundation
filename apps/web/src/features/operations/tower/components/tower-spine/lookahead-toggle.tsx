'use client';

import type { LookaheadHours } from '@sally/shared-types';
import { SegmentedControl, type SegmentedOption } from '@/shared/components/page-chrome';
import { LOOKAHEAD_OPTIONS } from '../../constants';

interface LookaheadToggleProps {
  value: LookaheadHours;
  onChange: (next: LookaheadHours) => void;
}

const OPTION_LABEL: Record<string, string> = {
  '2': '2h',
  '4': '4h',
  '8': '8h',
  shift: 'Shift',
};

/** Resolve a string option value back onto the typed LookaheadHours union. */
function toLookaheadHours(raw: string): LookaheadHours | null {
  if (raw === 'shift') return 'shift';
  const num = Number(raw);
  return LOOKAHEAD_OPTIONS.includes(num as LookaheadHours) ? (num as LookaheadHours) : null;
}

const OPTIONS: SegmentedOption[] = LOOKAHEAD_OPTIONS.map((opt) => ({
  value: String(opt),
  label: OPTION_LABEL[String(opt)],
}));

/**
 * Lookahead-window picker for the Tower control row. Values from constants.ts so
 * the schema stays the single source of truth. Uses the canonical
 * `SegmentedControl` for theme-correct, consistent styling.
 */
export function LookaheadToggle({ value, onChange }: LookaheadToggleProps) {
  return (
    <SegmentedControl
      options={OPTIONS}
      value={String(value)}
      onChange={(next) => {
        const resolved = toLookaheadHours(next);
        if (resolved !== null) onChange(resolved);
      }}
      label="Lookahead window"
    />
  );
}
