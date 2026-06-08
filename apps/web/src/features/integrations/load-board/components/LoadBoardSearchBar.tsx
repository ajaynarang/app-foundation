'use client';

import { useState, useCallback, useEffect } from 'react';
import { Search, Sparkles, Truck, ArrowRight, Clock, TrendingUp } from 'lucide-react';
import { cn } from '@sally/ui';
import { Button } from '@sally/ui/components/ui/button';
import { Input } from '@sally/ui/components/ui/input';
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@sally/ui/components/ui/command';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { CityCombobox } from './CityCombobox';
import { useTypingPlaceholder } from '../hooks/use-typing-placeholder';
import { useSearchHistory } from '../hooks/use-search-history';
import { formatRelativeTime } from '@/shared/lib/utils/formatters';
import { parseLocation } from '../utils/parse-location';
import type { LoadBoardSearchParams, EquipmentTypeFilter } from '../types';
import type { SearchHistoryEntry } from '../api';

const RADIUS_OPTIONS = [25, 50, 100, 150, 200];
const EQUIPMENT_OPTIONS: { value: EquipmentTypeFilter; label: string }[] = [
  { value: 'van', label: 'Van' },
  { value: 'reefer', label: 'Reefer' },
  { value: 'flatbed', label: 'Flatbed' },
  { value: 'step_deck', label: 'Step Deck' },
  { value: 'power_only', label: 'Power Only' },
];

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;

interface LoadBoardSearchBarProps {
  onSearch: (params: LoadBoardSearchParams) => void;
  onNlpSearch: (query: string) => void;
  onFindForMyDrivers: () => void;
  isSearching: boolean;
  isNlpParsing: boolean;
  isFindingDrivers: boolean;
  resolvedParams?: LoadBoardSearchParams | null;
}

export function LoadBoardSearchBar({
  onSearch,
  onNlpSearch,
  onFindForMyDrivers,
  isSearching,
  isNlpParsing,
  isFindingDrivers,
  resolvedParams,
}: LoadBoardSearchBarProps) {
  const [query, setQuery] = useState('');
  const [origin, setOrigin] = useState<{ city: string; state: string } | null>(null);
  const [originRadius, setOriginRadius] = useState(50);
  const [destination, setDestination] = useState<{ city: string; state: string } | null>(null);
  const [destRadius, setDestRadius] = useState(50);
  const [equipment, setEquipment] = useState<EquipmentTypeFilter[]>([]);
  const [minRate, setMinRate] = useState('');
  const [open, setOpen] = useState(false);

  const isLoading = isSearching || isNlpParsing;
  const animatedPlaceholder = useTypingPlaceholder(query.length === 0 && !origin && !open);
  const hasFilters = origin !== null || destination !== null || equipment.length > 0 || minRate !== '';
  const hasQuery = query.trim().length > 0;

  // Debounced query for history
  const [debouncedQuery, setDebouncedQuery] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (query.length < MIN_QUERY_LENGTH) {
      setDebouncedQuery(query.length === 0 ? undefined : undefined);
      return;
    }
    const timer = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: history } = useSearchHistory(debouncedQuery);
  const recentEntries = history?.recent || [];
  const frequentEntries = history?.frequent || [];
  const hasHistory = recentEntries.length > 0 || frequentEntries.length > 0;

  // Populate filters from resolved params
  useEffect(() => {
    if (!resolvedParams) return;
    if (resolvedParams.origin) {
      setOrigin({ city: resolvedParams.origin.city, state: resolvedParams.origin.state });
      setOriginRadius(resolvedParams.origin.radius ?? 50);
    }
    if (resolvedParams.destination) {
      setDestination({ city: resolvedParams.destination.city, state: resolvedParams.destination.state });
      setDestRadius(resolvedParams.destination.radius ?? 50);
    }
    if (resolvedParams.equipmentType?.length) setEquipment(resolvedParams.equipmentType);
    if (resolvedParams.minRate) setMinRate(String(resolvedParams.minRate));
    setQuery('');
  }, [resolvedParams]);

  const toggleEquipment = useCallback((value: EquipmentTypeFilter) => {
    setEquipment((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }, []);

  const handleSelectSuggestion = useCallback(
    (entry: SearchHistoryEntry) => {
      setOpen(false);
      setQuery(entry.label);
      if (!entry.origin) return;

      const params: LoadBoardSearchParams = {
        origin: { ...entry.origin, radius: 50 },
        provider: 'dat',
        page: 1,
        limit: 25,
      };
      if (entry.destination) params.destination = { ...entry.destination, radius: 50 };
      if (entry.equipment.length > 0) params.equipmentType = entry.equipment as EquipmentTypeFilter[];
      if (entry.minRate) params.minRate = entry.minRate;

      setOrigin(entry.origin);
      setOriginRadius(50);
      setDestination(entry.destination);
      setDestRadius(50);
      setEquipment((entry.equipment || []) as EquipmentTypeFilter[]);
      setMinRate(entry.minRate ? String(entry.minRate) : '');

      onSearch(params);
    },
    [onSearch],
  );

  const handleSearch = useCallback(() => {
    setOpen(false);
    if (hasQuery) {
      const trimmed = query.trim();
      const parsedOrigin = parseLocation(trimmed);
      if (parsedOrigin) {
        setOrigin(parsedOrigin);
        setOriginRadius(50);
        setQuery('');
        onSearch({
          origin: { ...parsedOrigin, radius: 50 },
          provider: 'dat',
          page: 1,
          limit: 25,
          ...(equipment.length > 0 && { equipmentType: equipment }),
        });
        return;
      }
      if (trimmed.length > 5) {
        onNlpSearch(trimmed);
        return;
      }
      return;
    }
    if (origin) {
      const params: LoadBoardSearchParams = {
        origin: { ...origin, radius: originRadius },
        provider: 'dat',
        page: 1,
        limit: 25,
      };
      if (destination) params.destination = { ...destination, radius: destRadius };
      if (equipment.length > 0) params.equipmentType = equipment;
      const parsedRate = parseFloat(minRate);
      if (minRate && !isNaN(parsedRate) && parsedRate > 0 && parsedRate <= 100) params.minRate = parsedRate;
      onSearch(params);
    }
  }, [query, hasQuery, origin, originRadius, destination, destRadius, equipment, minRate, onSearch, onNlpSearch]);

  const clearAll = () => {
    setQuery('');
    setOrigin(null);
    setDestination(null);
    setEquipment([]);
    setOriginRadius(50);
    setDestRadius(50);
    setMinRate('');
  };

  const canSearch = hasQuery || origin !== null;

  return (
    <div className="space-y-3">
      {/* Search input with autocomplete + action buttons */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Command shouldFilter={false} className="overflow-visible bg-transparent">
            {/* CommandInput — hide default icon/border via parent overrides */}
            <div className="relative [&_[cmdk-input-wrapper]]:border-0 [&_[cmdk-input-wrapper]]:px-0 [&_[cmdk-input-wrapper]>svg:first-child]:hidden">
              <Sparkles className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none z-10" />
              <CommandInput
                placeholder={animatedPlaceholder || 'Search loads...'}
                value={query}
                onValueChange={(value) => {
                  setQuery(value);
                  setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                onBlur={() => {
                  setTimeout(() => setOpen(false), 200);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown' && !open && hasHistory) {
                    setOpen(true);
                  }
                  if (e.key === 'Enter' && !hasHistory) {
                    e.preventDefault();
                    handleSearch();
                  }
                  if (e.key === 'Escape') {
                    setOpen(false);
                  }
                }}
                className="h-10 pl-8 rounded-md border border-input bg-background"
              />
            </div>

            {/* Dropdown suggestion list */}
            {open && hasHistory && (
              <div className="relative">
                <div className="absolute top-2 left-0 right-0 z-50 rounded-md border border-border bg-background shadow-lg">
                  <CommandList>
                    {recentEntries.length > 0 && (
                      <CommandGroup heading="Recent">
                        {recentEntries.slice(0, 5).map((entry) => (
                          <CommandItem
                            key={`recent-${entry.id}`}
                            value={entry.label}
                            onSelect={() => handleSelectSuggestion(entry)}
                          >
                            <Clock className="mr-2 h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="flex-1 truncate text-sm">{entry.label}</span>
                            <span className="text-2xs text-muted-foreground ml-2">
                              {formatRelativeTime(entry.searchedAt)}
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                    {frequentEntries.length > 0 && (
                      <>
                        {recentEntries.length > 0 && <CommandSeparator />}
                        <CommandGroup heading="Frequent">
                          {frequentEntries.map((entry) => (
                            <CommandItem
                              key={`freq-${entry.id}`}
                              value={`frequent-${entry.label}`}
                              onSelect={() => handleSelectSuggestion(entry)}
                            >
                              <TrendingUp className="mr-2 h-3 w-3 text-muted-foreground shrink-0" />
                              <span className="flex-1 truncate text-sm">{entry.label}</span>
                              <span className="text-2xs text-muted-foreground ml-2">{entry.searchCount}x</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </>
                    )}
                  </CommandList>
                </div>
              </div>
            )}
          </Command>
        </div>

        <Button onClick={handleSearch} disabled={!canSearch} loading={isLoading} className="h-10">
          {isNlpParsing ? <Sparkles className="mr-2 h-4 w-4 animate-pulse" /> : <Search className="mr-2 h-4 w-4" />}
          Search
        </Button>
        <Button
          onClick={() => {
            setOpen(false);
            onFindForMyDrivers();
          }}
          loading={isFindingDrivers}
          variant="outline"
          className="h-10"
        >
          <Truck className="mr-2 h-4 w-4" />
          For My Drivers
        </Button>
      </div>

      {/* Filters */}
      <div className={cn('flex flex-wrap items-center gap-2', hasQuery && 'opacity-40 pointer-events-none')}>
        <div className="flex items-center gap-1.5">
          <CityCombobox
            value={origin}
            onChange={(v) => setOrigin(v)}
            placeholder="Origin"
            className="w-[160px] h-8 text-xs"
          />
          {origin && (
            <Select value={String(originRadius)} onValueChange={(v) => setOriginRadius(Number(v))}>
              <SelectTrigger className="w-[72px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RADIUS_OPTIONS.map((r) => (
                  <SelectItem key={r} value={String(r)}>
                    {r} mi
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

        <div className="flex items-center gap-1.5">
          <CityCombobox
            value={destination}
            onChange={(v) => setDestination(v)}
            placeholder="Destination"
            className="w-[160px] h-8 text-xs"
          />
          {destination && (
            <Select value={String(destRadius)} onValueChange={(v) => setDestRadius(Number(v))}>
              <SelectTrigger className="w-[72px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RADIUS_OPTIONS.map((r) => (
                  <SelectItem key={r} value={String(r)}>
                    {r} mi
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="h-5 w-px bg-border hidden sm:block" />

        <div className="flex items-center gap-1">
          {EQUIPMENT_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              type="button"
              variant={equipment.includes(opt.value) ? 'default' : 'outline'}
              size="sm"
              className="h-8 text-xs px-2.5"
              onClick={() => toggleEquipment(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>

        <Input
          type="number"
          placeholder="Min $/mi"
          value={minRate}
          onChange={(e) => {
            const val = e.target.value;
            if (val === '' || (parseFloat(val) >= 0 && parseFloat(val) <= 100)) setMinRate(val);
          }}
          min={0}
          max={100}
          step={0.01}
          className="w-[100px] h-8 text-xs"
        />

        {hasFilters && (
          <button
            type="button"
            onClick={clearAll}
            className="text-[11px] text-muted-foreground hover:text-foreground whitespace-nowrap"
          >
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}
