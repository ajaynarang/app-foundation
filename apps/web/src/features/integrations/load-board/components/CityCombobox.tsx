'use client';

import { useState, useMemo, useCallback } from 'react';
import { MapPin, Check, ChevronsUpDown, CornerDownLeft } from 'lucide-react';
import { cn } from '@sally/ui';
import { Button } from '@sally/ui/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@sally/ui/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@sally/ui/components/ui/popover';
import { useReferenceData } from '@/features/platform/reference-data';
import { US_FREIGHT_CITIES } from '../data/us-freight-cities';
import { parseLocation } from '../utils/parse-location';

interface CityOption {
  city: string;
  state: string;
  label: string;
}

interface CityComboboxProps {
  value: { city: string; state: string } | null;
  onChange: (value: { city: string; state: string } | null) => void;
  placeholder?: string;
  className?: string;
}

export function CityCombobox({ value, onChange, placeholder = 'Search city...', className }: CityComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Load freight cities from reference data, fall back to static list
  const { data: refData } = useReferenceData('freight_city');
  const cities: CityOption[] = useMemo(() => {
    const freightCities = refData?.freight_city;
    if (freightCities && freightCities.length > 0) {
      return freightCities.map((item) => ({
        city: item.code,
        state: (item.metadata as { state?: string })?.state ?? '',
        label: item.label,
      }));
    }
    // Fallback to static data if reference data not loaded yet
    return US_FREIGHT_CITIES;
  }, [refData]);

  const filtered = useMemo(() => {
    if (!search) return cities.slice(0, 15);
    const q = search.toLowerCase();
    return cities
      .filter(
        (c) => c.city.toLowerCase().includes(q) || c.state.toLowerCase() === q || c.label.toLowerCase().includes(q),
      )
      .slice(0, 15);
  }, [search, cities]);

  // Check if typed input is a valid "City, ST" that isn't in the suggestions
  const customParsed = useMemo(() => {
    if (!search) return null;
    const parsed = parseLocation(search);
    if (!parsed) return null;
    const exists = cities.some((c) => c.city.toLowerCase() === parsed.city.toLowerCase() && c.state === parsed.state);
    return exists ? null : parsed;
  }, [search, cities]);

  const displayLabel = value ? `${value.city}, ${value.state}` : null;

  const handleSelect = useCallback(
    (city: CityOption) => {
      onChange({ city: city.city, state: city.state });
      setOpen(false);
      setSearch('');
    },
    [onChange],
  );

  const handleCustomSelect = useCallback(() => {
    if (!customParsed) return;
    onChange(customParsed);
    setOpen(false);
    setSearch('');
  }, [customParsed, onChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && customParsed && filtered.length === 0) {
        e.preventDefault();
        handleCustomSelect();
      }
    },
    [customParsed, filtered.length, handleCustomSelect],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('justify-between font-normal', !value && 'text-muted-foreground', className)}
        >
          <span className="flex items-center gap-1.5 truncate">
            <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
            {displayLabel || placeholder}
          </span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Type city, state (e.g. Dallas, TX)"
            value={search}
            onValueChange={setSearch}
            onKeyDown={handleKeyDown}
            className="h-9 text-sm"
          />
          <CommandList>
            {/* Suggestions from reference data */}
            {filtered.length > 0 && (
              <CommandGroup heading={search ? 'Suggestions' : 'Popular freight hubs'}>
                {filtered.map((city) => (
                  <CommandItem
                    key={city.label}
                    value={city.label}
                    onSelect={() => handleSelect(city)}
                    className="text-sm"
                  >
                    <Check
                      className={cn(
                        'mr-2 h-3.5 w-3.5',
                        value?.city === city.city && value?.state === city.state ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    {city.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {/* Custom city — when user types "City, ST" not in the list */}
            {customParsed && (
              <>
                {filtered.length > 0 && <CommandSeparator />}
                <CommandGroup>
                  <CommandItem
                    value={`custom-${customParsed.city}-${customParsed.state}`}
                    onSelect={handleCustomSelect}
                    className="text-sm"
                  >
                    <CornerDownLeft className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                    Use &quot;{customParsed.city}, {customParsed.state}&quot;
                  </CommandItem>
                </CommandGroup>
              </>
            )}

            {/* No matches and no valid custom parse */}
            {filtered.length === 0 && !customParsed && search && (
              <CommandEmpty className="py-3 text-center text-xs text-muted-foreground">
                Type as &quot;City, ST&quot; (e.g. Springfield, MO)
              </CommandEmpty>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
