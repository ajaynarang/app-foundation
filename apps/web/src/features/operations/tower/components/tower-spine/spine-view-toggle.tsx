'use client';

import { Truck, Users } from 'lucide-react';
import { SegmentedControl, type SegmentedOption } from '@/shared/components/page-chrome';

/** The two views the Tower spine can show. */
export type SpineView = 'drivers' | 'loads';

interface SpineViewToggleProps {
  value: SpineView;
  onChange: (next: SpineView) => void;
}

const VIEW_OPTIONS: SegmentedOption<SpineView>[] = [
  { value: 'drivers', label: 'Drivers', icon: Users },
  { value: 'loads', label: 'Loads', icon: Truck },
];

/**
 * Segmented Drivers · Loads toggle for the Tower canvas control row. Uses the
 * canonical `SegmentedControl` so its active styling is theme-correct and
 * consistent with the rest of the app. The `L` hotkey flips this from the page.
 */
export function SpineViewToggle({ value, onChange }: SpineViewToggleProps) {
  return <SegmentedControl options={VIEW_OPTIONS} value={value} onChange={onChange} label="Spine view" />;
}
