'use client';

import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useDebounce } from '../../hooks/use-debounce';
import { Input } from '../ui/input';
import { cn } from '../../lib/utils';

/** The one search debounce for every product list. */
export const LIST_SEARCH_DEBOUNCE_MS = 300;

export interface ListSearchProps {
  /** The applied search term (URL state — `useListParams().q`). */
  value: string;
  /** Called with the debounced term; wire to `useListParams().setQ`. */
  onChange: (value: string) => void;
  /** "Search <things>…" */
  placeholder: string;
  className?: string;
}

/**
 * ListSearch — the list search box. Keystrokes stay local; the applied term is pushed up
 * after the shared 300 ms debounce, and an outside change (Clear, back/forward, a shared
 * link) is pulled back in.
 */
export function ListSearch({ value, onChange, placeholder, className }: ListSearchProps) {
  const [draft, setDraft] = useState(value);
  const debounced = useDebounce(draft, LIST_SEARCH_DEBOUNCE_MS);
  // The term this box and the URL last agreed on — tells a settled keystroke from an outside change.
  const agreed = useRef(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (debounced === agreed.current) return;
    agreed.current = debounced;
    onChangeRef.current(debounced);
  }, [debounced]);

  useEffect(() => {
    if (value === agreed.current) return;
    agreed.current = value;
    setDraft(value);
  }, [value]);

  return (
    <div className={cn('relative w-full sm:w-56', className)}>
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder.replace(/…$/, '')}
        className="h-9 pl-9 text-sm"
      />
    </div>
  );
}
