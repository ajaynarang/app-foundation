'use client';

import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@sally/ui';
import { Button } from '@sally/ui/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@sally/ui/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@sally/ui/components/ui/popover';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import type { ExternalEntity } from '../types';

interface EntityPickerProps {
  value: string | null;
  entities: ExternalEntity[];
  isLoading?: boolean;
  placeholder?: string;
  onSelect: (entity: ExternalEntity | null) => void;
}

export function EntityPicker({ value, entities, isLoading, placeholder = 'Select...', onSelect }: EntityPickerProps) {
  const [open, setOpen] = useState(false);

  const selected = entities.find((e) => e.externalId === value) ?? null;

  if (isLoading) {
    return <Skeleton className="h-8 w-48" />;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          className="h-8 w-48 justify-between text-xs font-normal truncate"
        >
          <span className="truncate">
            {selected ? selected.externalName : <span className="text-muted-foreground">{placeholder}</span>}
          </span>
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search..." className="h-8 text-xs" />
          <CommandList>
            <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">No match found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__none__"
                onSelect={() => {
                  onSelect(null);
                  setOpen(false);
                }}
                className="text-xs text-muted-foreground"
              >
                <Check className={cn('mr-2 h-3 w-3', !value ? 'opacity-100' : 'opacity-0')} />
                None (unmatched)
              </CommandItem>
              {entities.map((entity) => (
                <CommandItem
                  key={entity.externalId}
                  value={entity.externalName}
                  onSelect={() => {
                    onSelect(entity);
                    setOpen(false);
                  }}
                  className="text-xs"
                >
                  <Check className={cn('mr-2 h-3 w-3', value === entity.externalId ? 'opacity-100' : 'opacity-0')} />
                  {entity.externalName}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
