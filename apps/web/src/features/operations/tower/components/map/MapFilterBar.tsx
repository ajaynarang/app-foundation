'use client';

import { Search } from 'lucide-react';
import { Input } from '@sally/ui/components/ui/input';
import { Button } from '@sally/ui/components/ui/button';

export type MapFilter = 'all' | 'in-transit' | 'idle' | 'hos-alert';

interface MapFilterBarProps {
  filter: MapFilter;
  onFilterChange: (filter: MapFilter) => void;
  search: string;
  onSearchChange: (search: string) => void;
}

const FILTERS: { value: MapFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'in-transit', label: 'In Transit' },
  { value: 'idle', label: 'Idle' },
  { value: 'hos-alert', label: 'HOS Alert' },
];

export function MapFilterBar({ filter, onFilterChange, search, onSearchChange }: MapFilterBarProps) {
  return (
    <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
      {/* Filter toggles */}
      <div className="flex items-center rounded-lg bg-background/80 backdrop-blur-sm border border-border p-0.5 shadow-md">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            variant="ghost"
            size="sm"
            onClick={() => onFilterChange(f.value)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium h-auto ${
              filter === f.value
                ? 'bg-foreground text-background shadow-sm hover:bg-foreground/90 hover:text-background'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search driver..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-8 w-40 pl-7 text-xs bg-background/80 backdrop-blur-sm border-border"
        />
      </div>
    </div>
  );
}
