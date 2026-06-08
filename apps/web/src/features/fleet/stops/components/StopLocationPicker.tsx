'use client';

import { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { X, MapPin, Plus, Clock, Search, Pencil, Navigation } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@sally/ui/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@sally/ui/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { FormSheet } from '@sally/ui/components/ui/form-sheet';
import { useStopSearch } from '../hooks/use-stop-search';
import { stopsApi } from '../api';
import { usePlacesAutocomplete } from '@/features/routing/places/hooks/use-places-autocomplete';
import { PLACES_MIN_QUERY_LENGTH } from '@/features/routing/places/constants';
import { useFeatureFlagEnabled } from '@/features/platform/feature-flags/hooks/use-feature-flags';
import { queryKeys } from '@/shared/constants/query-keys';
import { extractErrorMessage } from '@/shared/lib/error-utils';
import { showSuccess, showError } from '@sally/ui';
import { FEATURE_KEYS, type PlaceSuggestion, type StopSearchResult } from '@sally/shared-types';

/** Normalize a persisted Stop (Zod-optional → undefined) into the picker's emit shape. */
function toSelectedStop(stop: StopSearchResult): SelectedStop {
  return {
    id: stop.id,
    stopId: stop.stopId,
    name: stop.name,
    address: stop.address ?? undefined,
    city: stop.city ?? undefined,
    state: stop.state ?? undefined,
    zipCode: stop.zipCode ?? undefined,
    lat: stop.lat ?? undefined,
    lon: stop.lon ?? undefined,
  };
}

export interface SelectedStop {
  id?: number;
  stopId: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  lat?: number;
  lon?: number;
}

interface StopLocationPickerProps {
  value: SelectedStop | null;
  onChange: (stop: SelectedStop | null) => void;
  refData?: { us_state?: Array<{ code: string; label: string }> };
}

const US_STATES_FALLBACK = [
  'AL',
  'AK',
  'AZ',
  'AR',
  'CA',
  'CO',
  'CT',
  'DE',
  'FL',
  'GA',
  'HI',
  'ID',
  'IL',
  'IN',
  'IA',
  'KS',
  'KY',
  'LA',
  'ME',
  'MD',
  'MA',
  'MI',
  'MN',
  'MS',
  'MO',
  'MT',
  'NE',
  'NV',
  'NH',
  'NJ',
  'NM',
  'NY',
  'NC',
  'ND',
  'OH',
  'OK',
  'OR',
  'PA',
  'RI',
  'SC',
  'SD',
  'TN',
  'TX',
  'UT',
  'VT',
  'VA',
  'WA',
  'WV',
  'WI',
  'WY',
];

export function StopLocationPicker({ value, onChange, refData }: StopLocationPickerProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
  });
  const [newStop, setNewStop] = useState({
    name: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
  });

  const { data: searchData, isLoading } = useStopSearch(query);

  const states = useMemo(
    () =>
      refData?.us_state?.map((item) => ({
        code: item.code,
        label: item.label,
      })) ?? US_STATES_FALLBACK.map((s) => ({ code: s, label: s })),
    [refData],
  );

  const handleSelect = (stop: StopSearchResult) => {
    onChange(toSelectedStop(stop));
    setOpen(false);
    setQuery('');
  };

  // Tier 3 — external Places suggestions. Gated on the places_autocomplete
  // feature flag, then on a < 5 local-hit threshold so repeat lanes never pay
  // the latency or the HERE cost.
  const SUGGESTION_THRESHOLD = 5;
  const { data: placesFeatureEnabled } = useFeatureFlagEnabled(FEATURE_KEYS.PLACES_AUTOCOMPLETE);
  const tier12HitCount = searchData?.results?.length ?? 0;
  const tier3Enabled =
    !!placesFeatureEnabled && query.trim().length >= PLACES_MIN_QUERY_LENGTH && tier12HitCount < SUGGESTION_THRESHOLD;
  const { data: placesData, isLoading: isLoadingPlaces } = usePlacesAutocomplete(query, { enabled: tier3Enabled });
  const [isResolvingPlace, setIsResolvingPlace] = useState(false);

  const handleSuggestionSelect = async (suggestion: PlaceSuggestion) => {
    setIsResolvingPlace(true);
    try {
      const stop = await stopsApi.fromPlace(suggestion);
      onChange(toSelectedStop(stop));
      if (stop.isNew) showSuccess(`Location saved — ${stop.name}`);
      setOpen(false);
      setQuery('');
    } catch (error) {
      showError('Could not save location', extractErrorMessage(error));
    } finally {
      setIsResolvingPlace(false);
    }
  };

  const handleClear = () => {
    onChange(null);
  };

  const handleSwap = () => {
    setQuery('');
    setOpen(true);
  };

  const handleStartCreate = () => {
    setIsCreating(true);
    setNewStop({
      name: query || '',
      address: '',
      city: '',
      state: '',
      zipCode: '',
    });
    setOpen(false);
  };

  const handleSaveNew = async () => {
    if (!newStop.name.trim()) return;
    setIsSaving(true);
    try {
      const created = await stopsApi.create({
        name: newStop.name.trim(),
        address: newStop.address.trim() || undefined,
        city: newStop.city.trim() || undefined,
        state: newStop.state || undefined,
        zipCode: newStop.zipCode.trim() || undefined,
      });
      onChange(toSelectedStop(created));
      setIsCreating(false);
      setQuery('');
      queryClient.invalidateQueries({ queryKey: queryKeys.stops.root });
      showSuccess(created.isNew ? 'Location saved' : 'Matched existing location');
    } catch {
      showError('Failed to save location');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelCreate = () => {
    setIsCreating(false);
  };

  // ── Edit sheet handlers ──
  const handleOpenEdit = () => {
    if (!value) return;
    setEditForm({
      name: value.name || '',
      address: value.address || '',
      city: value.city || '',
      state: value.state || '',
      zipCode: value.zipCode || '',
    });
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!value || !editForm.name.trim()) return;
    setIsUpdating(true);
    try {
      if (value.id) {
        // Persisted stop — update via API
        const updated = await stopsApi.update(value.id, {
          name: editForm.name.trim(),
          address: editForm.address.trim() || undefined,
          city: editForm.city.trim() || undefined,
          state: editForm.state || undefined,
          zipCode: editForm.zipCode.trim() || undefined,
        });
        onChange(toSelectedStop(updated));
        queryClient.invalidateQueries({ queryKey: queryKeys.stops.root });
        showSuccess('Location updated');
      } else {
        // Local-only stop — just update form state
        onChange({
          ...value,
          name: editForm.name.trim(),
          address: editForm.address.trim() || undefined,
          city: editForm.city.trim() || undefined,
          state: editForm.state || undefined,
          zipCode: editForm.zipCode.trim() || undefined,
        });
        showSuccess('Location updated');
      }
      setEditOpen(false);
    } catch {
      showError('Failed to update location');
    } finally {
      setIsUpdating(false);
    }
  };

  // ── Selected state: compact pill with swap + edit ──
  if (value && !isCreating) {
    return (
      <>
        <div className="flex items-start gap-2 rounded-md border border-border bg-card px-3 py-2 group">
          <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <button
            type="button"
            className="flex-1 min-w-0 text-left cursor-pointer"
            onClick={handleSwap}
            title="Click to change location"
          >
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-foreground truncate">{value.name}</span>
              {value.lat != null && value.lon != null ? (
                <span title={`${value.lat.toFixed(4)}, ${value.lon.toFixed(4)}`}>
                  <Navigation className="h-3 w-3 text-emerald-500 dark:text-emerald-400 flex-shrink-0" />
                </span>
              ) : (
                <span
                  className="inline-block h-2 w-2 rounded-full bg-amber-400 dark:bg-amber-500 flex-shrink-0"
                  title="No coordinates — geocoding pending"
                />
              )}
            </div>
            {(value.address || value.city || value.state) && (
              <div className="text-xs text-muted-foreground truncate">
                {[value.address, [value.city, value.state].filter(Boolean).join(', '), value.zipCode]
                  .filter(Boolean)
                  .join(', ')}
              </div>
            )}
          </button>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={handleOpenEdit}
              title="Edit location details"
            >
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
              onClick={handleClear}
              title="Remove location"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Swap popover — opens search over the pill */}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <span className="sr-only">Change location</span>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Search by name, address, or city..."
                className="h-9 text-sm"
                value={query}
                onValueChange={setQuery}
                autoFocus
              />
              <CommandList>
                {isLoading ? (
                  <div className="p-3 space-y-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-3/4" />
                  </div>
                ) : (
                  <>{renderSearchContent()}</>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Edit location Sheet */}
        <FormSheet
          open={editOpen}
          onOpenChange={setEditOpen}
          title="Edit Location"
          description="Update this location's details. Changes apply to all loads using this location."
          size="sm"
          mode="edit"
          onSubmit={handleSaveEdit}
          submitLabel="Save"
          isSubmitting={isUpdating}
          submitDisabled={!editForm.name.trim()}
        >
          <div className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="Walmart DC #4523"
              />
            </div>
            <div>
              <Label>Address</Label>
              <Input
                value={editForm.address}
                onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                placeholder="123 Main St"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>City</Label>
                <Input
                  value={editForm.city}
                  onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                  placeholder="Dallas"
                />
              </div>
              <div>
                <Label>State</Label>
                <Select value={editForm.state} onValueChange={(v) => setEditForm({ ...editForm, state: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="--" />
                  </SelectTrigger>
                  <SelectContent>
                    {states.map((st) => (
                      <SelectItem key={st.code} value={st.code}>
                        {st.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>ZIP</Label>
                <Input
                  value={editForm.zipCode}
                  onChange={(e) => setEditForm({ ...editForm, zipCode: e.target.value })}
                  placeholder="75201"
                  maxLength={10}
                />
              </div>
            </div>

            {/* Coordinates — read-only, generated by geocoding */}
            <div className="rounded-md border border-border bg-muted/50 dark:bg-muted/20 p-3">
              <Label className="text-xs text-muted-foreground">Coordinates</Label>
              {value?.lat != null && value?.lon != null ? (
                <div className="flex items-center gap-2 mt-1">
                  <Navigation className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400 flex-shrink-0" />
                  <span className="text-sm font-mono text-foreground">
                    {value.lat.toFixed(6)}, {value.lon.toFixed(6)}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 mt-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-400 dark:bg-amber-500 flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">
                    Not geocoded yet — coordinates will be generated when a load is created with this location
                  </span>
                </div>
              )}
            </div>
          </div>
        </FormSheet>
      </>
    );
  }

  // ── Creating state: inline form ──
  if (isCreating) {
    return (
      <div className="rounded-md border border-border bg-card p-3 space-y-2.5">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">New Location</div>
        <div>
          <Label className="text-[11px] text-muted-foreground">Name *</Label>
          <Input
            className="h-8 text-sm"
            value={newStop.name}
            onChange={(e) => setNewStop({ ...newStop, name: e.target.value })}
            placeholder="Walmart DC #4523"
            autoFocus
          />
        </div>
        <div>
          <Label className="text-[11px] text-muted-foreground">Address</Label>
          <Input
            className="h-8 text-sm"
            value={newStop.address}
            onChange={(e) => setNewStop({ ...newStop, address: e.target.value })}
            placeholder="123 Main St"
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-[11px] text-muted-foreground">City</Label>
            <Input
              className="h-8 text-sm"
              value={newStop.city}
              onChange={(e) => setNewStop({ ...newStop, city: e.target.value })}
              placeholder="Dallas"
            />
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">State</Label>
            <Select value={newStop.state} onValueChange={(v) => setNewStop({ ...newStop, state: v })}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="--" />
              </SelectTrigger>
              <SelectContent>
                {states.map((st) => (
                  <SelectItem key={st.code} value={st.code}>
                    {st.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">ZIP</Label>
            <Input
              className="h-8 text-sm"
              value={newStop.zipCode}
              onChange={(e) => setNewStop({ ...newStop, zipCode: e.target.value })}
              placeholder="75201"
              maxLength={10}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" size="sm" onClick={handleCancelCreate}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={handleSaveNew} disabled={!newStop.name.trim()} loading={isSaving}>
            Save & Select
          </Button>
        </div>
      </div>
    );
  }

  // ── Search state: Popover with Command (no selection yet) ──
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full h-9 justify-start text-sm font-normal text-muted-foreground"
        >
          <Search className="h-3.5 w-3.5 mr-2 flex-shrink-0" />
          Search locations or type an address...
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search by name, address, or city..."
            className="h-9 text-sm"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {isLoading ? (
              <div className="p-3 space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-3/4" />
              </div>
            ) : (
              renderSearchContent()
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );

  // ── Shared search content renderer ──
  function renderSearchContent() {
    return (
      <>
        {/* Recent locations (shown when no query) */}
        {!query && searchData?.recent && searchData.recent.length > 0 && (
          <CommandGroup heading="Recent">
            {searchData.recent.map((stop) => (
              <CommandItem
                key={`recent-${stop.id}`}
                value={`recent-${stop.id}`}
                onSelect={() => handleSelect(stop)}
                className="flex items-start gap-2 py-2"
              >
                <Clock className="h-3.5 w-3.5 mt-0.5 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm truncate">{stop.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {[stop.city, stop.state].filter(Boolean).join(', ')}
                    {stop.useCount > 0 && ` · Used ${stop.useCount} time${stop.useCount > 1 ? 's' : ''}`}
                  </div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* No query, no recents */}
        {!query && (!searchData?.recent || searchData.recent.length === 0) && (
          <div className="py-6 text-center text-xs text-muted-foreground">
            No saved locations yet. Type a name to create your first.
          </div>
        )}

        {/* Search results */}
        {query && searchData?.results && searchData.results.length > 0 && (
          <CommandGroup heading="Locations">
            {searchData.results.map((stop) => (
              <CommandItem
                key={`result-${stop.id}`}
                value={`result-${stop.id}`}
                onSelect={() => handleSelect(stop)}
                className="flex items-start gap-2 py-2"
              >
                <MapPin className="h-3.5 w-3.5 mt-0.5 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm truncate">{stop.name}</span>
                    {stop.lat != null && stop.lon != null ? (
                      <Navigation className="h-2.5 w-2.5 text-emerald-500 dark:text-emerald-400 flex-shrink-0" />
                    ) : (
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400 dark:bg-amber-500 flex-shrink-0" />
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {[stop.address, [stop.city, stop.state].filter(Boolean).join(', ')].filter(Boolean).join(', ')}
                    {stop.useCount > 0 && ` · Used ${stop.useCount} time${stop.useCount > 1 ? 's' : ''}`}
                    {stop.avgDockHours != null && ` · Avg dock: ${stop.avgDockHours} hrs`}
                  </div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* No results for query (only when tier-3 also has nothing to show) */}
        {query && (!searchData?.results || searchData.results.length === 0) && !tier3Enabled && !isLoadingPlaces && (
          <div className="py-4 text-center text-xs text-muted-foreground">No locations match &ldquo;{query}&rdquo;</div>
        )}

        {/* Tier 3 — external address suggestions (HERE) */}
        {tier3Enabled && (isLoadingPlaces || (placesData?.results.length ?? 0) > 0) && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Suggestions">
              {isLoadingPlaces && (
                <div className="space-y-1.5 px-2 py-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              )}
              {placesData?.results.map((suggestion) => (
                <CommandItem
                  key={suggestion.externalId}
                  value={`place-${suggestion.externalId}`}
                  onSelect={() => handleSuggestionSelect(suggestion)}
                  disabled={isResolvingPlace}
                  className="flex items-start gap-2 py-2"
                >
                  <Search className="h-3.5 w-3.5 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">{suggestion.text}</div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Always show create option when there's a query */}
        {query && (
          <>
            <CommandSeparator />
            <CommandGroup>
              <CommandItem value="__create__" onSelect={handleStartCreate} className="flex items-center gap-2 py-2">
                <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm">Create &ldquo;{query}&rdquo; as new location</span>
              </CommandItem>
            </CommandGroup>
          </>
        )}

        {/* Subnote: where to browse the full locations catalog. Non-clickable hint. */}
        <div className="border-t border-border px-3 py-2 text-2xs text-muted-foreground">
          Browse all saved locations in <span className="font-medium text-foreground">Fleet → Locations</span>{' '}
          (sidebar).
        </div>
      </>
    );
  }
}
