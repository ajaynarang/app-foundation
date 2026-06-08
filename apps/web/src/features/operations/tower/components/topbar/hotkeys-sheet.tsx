'use client';

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@sally/ui/components/ui/sheet';
import { HOTKEYS } from '../../constants';

interface HotkeysSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface HotkeyRow {
  keys: string[];
  label: string;
  hint?: string;
}

/**
 * Every Tower shortcut, in the order a dispatcher learns them. `keys` is an
 * array so combos and ranges render as separate chips ("1 / 2 / 3").
 */
const HOTKEY_ROWS: HotkeyRow[] = [
  { keys: [HOTKEYS.SALLY.toUpperCase()], label: 'Open Sally' },
  { keys: [HOTKEYS.SPINE_LOADS.toUpperCase()], label: 'Switch the spine to Drivers / Active loads' },
  {
    keys: [HOTKEYS.FOCUS_SPINE, HOTKEYS.FOCUS_MAP, HOTKEYS.FOCUS_WIRE],
    label: 'Focus a pane',
    hint: 'Narrow screens — hold 3 to peek the wire',
  },
  { keys: [HOTKEYS.WIRE_DRAWER.toUpperCase()], label: 'Open the wire', hint: 'Narrow screens' },
  { keys: [HOTKEYS.HELP], label: 'This shortcut list' },
  { keys: ['Esc'], label: 'Close the topmost overlay' },
];

/**
 * Topbar `?` sheet — the full Tower hotkey reference. Controlled by the page
 * so the `?` hotkey and the topbar chip share one open state.
 */
export function HotkeysSheet({ open, onOpenChange }: HotkeysSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent pinnable resizable className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Keyboard shortcuts</SheetTitle>
          <SheetDescription>Single keys, no modifier needed — they pause while you&apos;re typing.</SheetDescription>
        </SheetHeader>

        <dl className="mt-6 space-y-3">
          {HOTKEY_ROWS.map((row) => (
            <div key={row.label} className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <dt className="text-sm text-foreground">{row.label}</dt>
                {row.hint && <p className="mt-0.5 text-xs text-muted-foreground">{row.hint}</p>}
              </div>
              <dd className="flex shrink-0 items-center gap-1">
                {row.keys.map((key) => (
                  <KeyChip key={key}>{key}</KeyChip>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </SheetContent>
    </Sheet>
  );
}

function KeyChip({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-6 min-w-[24px] items-center justify-center rounded border border-border bg-muted px-1.5 text-xs font-medium text-muted-foreground">
      {children}
    </kbd>
  );
}
