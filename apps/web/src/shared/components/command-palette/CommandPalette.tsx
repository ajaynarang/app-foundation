'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { create } from 'zustand';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandList,
  CommandSeparator,
} from '@app/ui/components/ui/command';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/ui/components/ui/tooltip';
import { cn } from '@app/ui';
import { usePaletteItems } from './use-palette-items';
import { PaletteItemRow } from './PaletteItem';

// ---------------------------------------------------------------------------
// Shared Zustand store — lets header and sidebar both open the same dialog
// ---------------------------------------------------------------------------

interface PaletteState {
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

export const usePaletteStore = create<PaletteState>((set) => ({
  isOpen: false,
  setOpen: (isOpen) => set({ isOpen }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
}));

// ---------------------------------------------------------------------------
// CommandPalette — renders the dialog (must be mounted once in layout)
// ---------------------------------------------------------------------------

export function CommandPalette() {
  const router = useRouter();
  const { isOpen, setOpen } = usePaletteStore();
  const [query, setQuery] = useState('');
  const groups = usePaletteItems(query);

  // Reset query when dialog closes
  const handleOpenChange = useCallback(
    (open: boolean) => {
      setOpen(open);
      if (!open) setQuery('');
    },
    [setOpen],
  );

  const handleSelect = useCallback(
    (onSelect: () => void, isGated?: boolean) => {
      setOpen(false);
      setQuery('');
      if (isGated) {
        router.push('/settings/subscription');
      } else {
        onSelect();
      }
    },
    [setOpen, router],
  );

  return (
    <>
      {/* Dialog — triggered by sidebar CommandPaletteTrigger or ⌘K */}
      <CommandDialog open={isOpen} onOpenChange={handleOpenChange} shouldFilter={false}>
        <CommandInput placeholder="Search, navigate, or jump to anything..." value={query} onValueChange={setQuery} />
        <CommandList className="max-h-[380px]">
          <CommandEmpty>
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <p className="text-sm text-muted-foreground">No results found</p>
              <p className="text-xs text-muted-foreground">Try a different search term</p>
            </div>
          </CommandEmpty>

          {groups.map((group, groupIdx) => (
            <div key={group.heading}>
              {groupIdx > 0 && <CommandSeparator />}
              <CommandGroup heading={group.heading}>
                {group.items.map((item) => (
                  <PaletteItemRow
                    key={item.id}
                    item={item}
                    onSelect={() => handleSelect(item.onSelect, item.isGated)}
                  />
                ))}
              </CommandGroup>
            </div>
          ))}
        </CommandList>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-3 py-2">
          <div className="flex items-center gap-3 text-2xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono">↑</kbd>
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono">↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono">↵</kbd>
              select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono">esc</kbd>
              close
            </span>
          </div>
        </div>
      </CommandDialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// CommandPaletteTrigger — standalone trigger for sidebar
// ---------------------------------------------------------------------------

export function CommandPaletteTrigger({ collapsed }: { collapsed?: boolean }) {
  const { setOpen } = usePaletteStore();

  if (collapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <button
            onClick={() => setOpen(true)}
            className={cn(
              'flex items-center justify-center w-full rounded-md py-2',
              'border border-border hover:bg-muted transition-colors',
            )}
            title="Search"
          >
            <Search className="h-4 w-4 text-muted-foreground" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          Search
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <button
      onClick={() => setOpen(true)}
      className={cn(
        'flex items-center gap-3 w-full rounded-md px-3 py-2 text-sm font-medium',
        'border border-border hover:bg-muted transition-colors',
      )}
    >
      <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      <span className="flex-1 text-left text-foreground">Search</span>
      <kbd className="pointer-events-none h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-2xs font-medium text-muted-foreground flex">
        <span className="text-xs">⌘</span>K
      </kbd>
    </button>
  );
}

export default CommandPalette;
