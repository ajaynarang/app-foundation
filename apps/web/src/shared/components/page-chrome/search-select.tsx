'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { extractErrorMessage } from '@appshore/web-core/shared/lib/error-utils';
import { cn } from '@appshore/web-core/shared/lib/utils';
import { Button } from '@/shared/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/shared/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { useResultHighlight } from '@/shared/hooks/use-result-highlight';
import { usePickerSearch, type PickerSearchSource } from '@appshore/web-core/shared/list';

const LOADING_ROWS = 4;

export interface SearchSelectOption {
  /** The value the form submits (a public id). Unique within the results. */
  key: string;
  label: string;
  /** A short prefix shown in mono before the label — a human key such as `C-14`. */
  code?: string;
  /** Why this row can't be picked here ("Already in Payments as Developer") — shown on the row, which stays disabled. */
  disabledReason?: string;
}

export interface SearchSelectProps<T> {
  /** The id of the trigger, for a `<Label htmlFor>`. */
  id?: string;
  /** The accessible name of the trigger when no visible label points at it. */
  ariaLabel?: string;
  /** The chosen option. The select keeps the whole option so it can name a record no page holds. */
  value: SearchSelectOption | null;
  onChange: (option: SearchSelectOption) => void;
  /** Where the options come from — the list endpoint, searched on the server. */
  source: PickerSearchSource<T>;
  toOption: (row: T) => SearchSelectOption;
  /** Trigger text when nothing is chosen — "Pick a pack". */
  placeholder: string;
  /** "Search packs…" */
  searchPlaceholder: string;
  /** The plural the messages use — "packs". */
  noun: string;
  /** Shown instead of "No <noun> yet." when the unsearched list is empty. */
  emptyLabel?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * SearchSelect — a form select over a server list. Unlike a `Select` filled from one fetch, it
 * reaches every record: the first page until the user types, then the endpoint's own `q` search
 * on the shared debounce. It says when more exist than it shows, shows a skeleton while loading
 * and a message with Retry on failure.
 */
export function SearchSelect<T>({
  id,
  ariaLabel,
  value,
  onChange,
  source,
  toOption,
  placeholder,
  searchPlaceholder,
  noun,
  emptyLabel,
  disabled = false,
  className,
}: SearchSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const search = usePickerSearch(query, source, { enabled: open });
  const options = useMemo(() => search.items.map(toOption), [search.items, toOption]);
  // ↵ picks the highlighted row, so the highlight must follow the results: first row of each new set.
  const highlight = useResultHighlight(options);
  const hiddenCount = search.total - options.length;

  const handleOpenChange = (next: boolean) => {
    if (!next) setQuery('');
    highlight.reset(next ? (value?.key ?? '') : '');
    setOpen(next);
  };

  const handleQueryChange = (next: string) => {
    setQuery(next);
    highlight.reset();
  };

  const handleSelect = (option: SearchSelectOption) => {
    // While the rows still answer an earlier term, ↵ must not pick one of them by accident.
    if (search.isStale || option.disabledReason) return;
    onChange(option);
    handleOpenChange(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn('h-9 w-full justify-between px-3 font-normal', !value && 'text-muted-foreground', className)}
        >
          <span className="truncate">
            {value ? (value.code ? `${value.code} — ${value.label}` : value.label) : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[max(var(--radix-popover-trigger-width),16rem)] max-w-[calc(100vw-2rem)] p-0"
        align="start"
      >
        <Command shouldFilter={false} value={highlight.key} onValueChange={highlight.set}>
          <CommandInput value={query} onValueChange={handleQueryChange} placeholder={searchPlaceholder} />
          <CommandList className={cn('transition-opacity', search.isStale && 'opacity-60')} aria-busy={search.isStale}>
            {search.isLoading ? (
              <div className="space-y-2 p-2" aria-hidden="true">
                {Array.from({ length: LOADING_ROWS }, (_, row) => (
                  <Skeleton key={row} className="h-7 w-full" />
                ))}
              </div>
            ) : search.isError ? (
              // A failed search must not read as "nothing matches".
              <div className="px-4 py-6 text-center" role="alert">
                <p className="text-sm text-destructive">Couldn&apos;t load {noun}.</p>
                <p className="mt-1 text-xs text-muted-foreground">{extractErrorMessage(search.error)}</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => search.refetch()}>
                  Retry
                </Button>
              </div>
            ) : (
              <>
                <CommandEmpty>
                  {search.isSearching ? `No ${noun} match.` : (emptyLabel ?? `No ${noun} yet.`)}
                </CommandEmpty>
                <CommandGroup>
                  {options.map((option) => (
                    <CommandItem
                      key={option.key}
                      value={option.key}
                      disabled={!!option.disabledReason}
                      onSelect={() => handleSelect(option)}
                    >
                      {option.code && (
                        <span className="mr-2 shrink-0 whitespace-nowrap font-mono text-xs text-muted-foreground">
                          {option.code}
                        </span>
                      )}
                      <span className="truncate">{option.label}</span>
                      {option.disabledReason && (
                        <span
                          title={option.disabledReason}
                          className="ml-auto min-w-0 max-w-[60%] truncate pl-3 text-right text-xs text-muted-foreground"
                        >
                          <span className="sr-only"> — </span>
                          {option.disabledReason}
                        </span>
                      )}
                      {value?.key === option.key && (
                        <Check className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
                {hiddenCount > 0 && (
                  // A picker never stops silently: say how many more there are and how to reach them.
                  <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                    {search.isSearching
                      ? `Showing ${options.length} of ${search.total} matches — keep typing to narrow it down.`
                      : `Showing the first ${options.length} of ${search.total} — search to reach the rest.`}
                  </p>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
