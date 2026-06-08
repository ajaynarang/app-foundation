'use client';

import { CommandItem } from '@sally/ui/components/ui/command';
import { Sparkles } from 'lucide-react';
import { cn } from '@sally/ui';
import type { PaletteItem as PaletteItemType } from './command-registry';

interface PaletteItemProps {
  item: PaletteItemType;
  onSelect: () => void;
}

export function PaletteItemRow({ item, onSelect }: PaletteItemProps) {
  const Icon = item.icon;
  const isGated = item.isGated;

  return (
    <CommandItem
      value={[item.label, item.description, ...(item.keywords ?? [])].filter(Boolean).join(' ')}
      onSelect={onSelect}
      className={cn('flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer', isGated && 'opacity-50')}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        {isGated ? <Sparkles className="h-4 w-4 text-info" /> : <Icon className="h-4 w-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className={cn('text-sm truncate text-foreground', isGated && 'text-muted-foreground')}>{item.label}</div>
        {item.description && <div className="text-xs text-muted-foreground truncate">{item.description}</div>}
      </div>
      {isGated && (
        <span className="shrink-0 text-2xs text-muted-foreground border border-border rounded-full px-2 py-0.5">
          add-on
        </span>
      )}
    </CommandItem>
  );
}
