'use client';

import { useMemo } from 'react';
import { Search, PackageOpen } from 'lucide-react';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { ScrollArea } from '@sally/ui/components/ui/scroll-area';
import { LoadBoardListingCard } from './LoadBoardListingCard';
import type { LoadBoardListing } from '../types';

const SORT_OPTIONS = [
  { value: 'ratePerMile', label: 'Rate $/mi' },
  { value: 'rate', label: 'Total Rate' },
  { value: 'pickupDate', label: 'Pickup Date' },
  { value: 'distance', label: 'Distance' },
  { value: 'postedAt', label: 'Posted' },
] as const;

type SortKey = (typeof SORT_OPTIONS)[number]['value'];

interface LoadBoardResultsProps {
  listings: LoadBoardListing[];
  selectedId: string | null;
  onSelect: (listing: LoadBoardListing) => void;
  total: number;
  sortBy: SortKey;
  onSortChange: (sort: SortKey) => void;
  isLoading: boolean;
  hasSearched: boolean;
}

function sortListings(listings: LoadBoardListing[], sortBy: SortKey): LoadBoardListing[] {
  return [...listings].sort((a, b) => {
    switch (sortBy) {
      case 'ratePerMile':
        return b.ratePerMile - a.ratePerMile;
      case 'rate':
        return b.rate - a.rate;
      case 'pickupDate':
        return new Date(a.pickupDate).getTime() - new Date(b.pickupDate).getTime();
      case 'distance':
        return a.distance - b.distance;
      case 'postedAt':
        return new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime();
      default:
        return 0;
    }
  });
}

export function LoadBoardResults({
  listings,
  selectedId,
  onSelect,
  total,
  sortBy,
  onSortChange,
  isLoading,
  hasSearched,
}: LoadBoardResultsProps) {
  const sorted = useMemo(() => sortListings(listings, sortBy), [listings, sortBy]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 px-6 py-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        ))}
      </div>
    );
  }

  if (!hasSearched) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <Search className="h-12 w-12 text-muted-foreground/40" />
        <p className="text-sm font-medium text-foreground">Search for available loads</p>
        <p className="text-xs text-muted-foreground max-w-sm">
          Type what you need in the search bar or use the filters, then click Search Loads
        </p>
      </div>
    );
  }

  if (listings.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <PackageOpen className="h-12 w-12 text-muted-foreground/40" />
        <p className="text-sm font-medium text-foreground">No loads found</p>
        <p className="text-xs text-muted-foreground max-w-sm">Try expanding your search radius or adjusting filters</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-border px-6 py-2">
        <span className="text-sm text-muted-foreground">
          {total} load{total !== 1 ? 's' : ''} found
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Sort by</span>
          <Select value={sortBy} onValueChange={(v) => onSortChange(v as SortKey)}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-2 px-6 py-3">
          {sorted.map((listing) => (
            <LoadBoardListingCard
              key={listing.externalId}
              listing={listing}
              isSelected={listing.externalId === selectedId}
              onClick={() => onSelect(listing)}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

export type { SortKey };
