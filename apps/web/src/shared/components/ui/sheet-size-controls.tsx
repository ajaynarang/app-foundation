'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { cn } from '@/shared/lib/utils';
import { Button } from '@app/ui/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/ui/components/ui/tooltip';
import { useSheetSizeStore, SHEET_SIZE_MODE_OPTIONS, type SheetSizeMode } from '@/shared/stores/sheet-size.store';
import { useSheetContext } from '@app/ui/components/ui/sheet';

interface SheetSizeControlsProps {
  entityType: string;
  /** Show the full-screen (□) option. Default: false — only side-panel + half. */
  allowFull?: boolean;
}

const SIZE_META: Record<SheetSizeMode, { icon: string; label: string; shortcut: string }> = {
  'side-panel': { icon: '◧', label: 'Side panel', shortcut: '⇧⌘1' },
  half: { icon: '◨', label: 'Half screen', shortcut: '⇧⌘2' },
  full: { icon: '□', label: 'Full screen', shortcut: '⇧⌘3' },
};

/** Convert a sizing mode to a pixel width for the resizable sheet system */
function sizeModeToPixels(mode: SheetSizeMode): number {
  switch (mode) {
    case 'side-panel':
      return 672; // matches sm:max-w-2xl (42rem)
    case 'half':
      return Math.floor(window.innerWidth / 2);
    case 'full':
      return window.innerWidth;
  }
}

export function SheetSizeControls({ entityType, allowFull = false }: SheetSizeControlsProps) {
  const currentSize = useSheetSizeStore((s) => s.sizes[entityType] ?? 'side-panel');
  const setSize = useSheetSizeStore((s) => s.setSize);
  const { setWidth } = useSheetContext();

  const visibleModes = useMemo(
    () => (allowFull ? SHEET_SIZE_MODE_OPTIONS : SHEET_SIZE_MODE_OPTIONS.filter((m) => m !== 'full')),
    [allowFull],
  );

  const applySize = useCallback(
    (mode: SheetSizeMode) => {
      setSize(entityType, mode);
      setWidth(sizeModeToPixels(mode));
    },
    [entityType, setSize, setWidth],
  );

  const handleKeydown = useCallback(
    (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey) return;
      const idx = ['1', '2', '3'].indexOf(e.key);
      if (idx >= 0 && idx < visibleModes.length) {
        e.preventDefault();
        applySize(visibleModes[idx]);
      }
    },
    [applySize, visibleModes],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [handleKeydown]);

  return (
    <div className="flex border border-border rounded-md overflow-hidden">
      {visibleModes.map((key, idx) => {
        const meta = SIZE_META[key];
        return (
          <Tooltip key={key}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'h-7 w-7 px-0 rounded-none text-xs',
                  currentSize === key
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                  idx > 0 && 'border-l border-border',
                )}
                onClick={() => applySize(key)}
                aria-label={meta.label}
              >
                {meta.icon}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {meta.label} ({meta.shortcut})
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
