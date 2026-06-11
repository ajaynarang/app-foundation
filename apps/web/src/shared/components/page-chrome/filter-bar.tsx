'use client';

import type { ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/shared/components/ui/input';
import { cn } from '@/shared/lib/utils';

export interface FilterBarProps {
  /** Controlled search value. Omit search entirely by not passing searchValue + onSearchChange. */
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  /** Search placeholder. Default "Search...". */
  searchPlaceholder?: string;
  /** Width class for the search input. Default "w-full sm:w-[200px]". */
  searchClassName?: string;

  /** MIDDLE: filter controls — <DateRangeFilter/>, <Select/>, toggle <Button/>s, drill pills, etc. */
  children?: ReactNode;

  /** RIGHT: typically <SortButton/>. Pinned far-right on desktop (sm:ml-auto). */
  sort?: ReactNode;

  className?: string;
}

/**
 * FilterBar — Zone 3 of the canonical page chrome. Search left, filter controls middle,
 * sort right. Scoped to the active tab. Unstyled re: container — pages decide whether to
 * wrap it in a Card/CardHeader or leave it bare (e.g. above a board).
 * See app-frontend-patterns §16 (Page Chrome).
 */
export function FilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search...',
  searchClassName = 'w-full sm:w-[200px]',
  children,
  sort,
  className,
}: FilterBarProps) {
  const hasSearch = searchValue !== undefined && onSearchChange !== undefined;

  return (
    <div className={cn('flex flex-col gap-2 sm:flex-row sm:items-center', className)}>
      {hasSearch && (
        <div className={cn('relative', searchClassName)}>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-9"
          />
        </div>
      )}
      {children}
      {sort && <div className="sm:ml-auto">{sort}</div>}
    </div>
  );
}
