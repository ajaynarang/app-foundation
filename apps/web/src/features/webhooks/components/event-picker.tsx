'use client';

import { useState, useMemo } from 'react';
import { Checkbox } from '@app/ui/components/ui/checkbox';
import { Input } from '@app/ui/components/ui/input';
import { Label } from '@app/ui/components/ui/label';
import { Skeleton } from '@app/ui/components/ui/skeleton';
import { Search } from 'lucide-react';
import { useEventCatalog } from '../use-webhooks';

interface EventPickerProps {
  wildcard: boolean;
  onWildcardChange: (wildcard: boolean) => void;
  selectedEvents: string[];
  onSelectedEventsChange: (events: string[]) => void;
}

export function EventPicker({ wildcard, onWildcardChange, selectedEvents, onSelectedEventsChange }: EventPickerProps) {
  const { data, isLoading } = useEventCatalog();
  const [search, setSearch] = useState('');

  const categories = data?.categories ?? [];

  const filteredCategories = useMemo(() => {
    if (!search.trim()) return categories;
    const q = search.toLowerCase();
    return categories
      .map((category) => ({
        ...category,
        events: category.events.filter(
          (e) =>
            e.name.toLowerCase().includes(q) ||
            e.label.toLowerCase().includes(q) ||
            e.description.toLowerCase().includes(q),
        ),
      }))
      .filter((category) => category.events.length > 0);
  }, [categories, search]);

  function toggleEvent(event: string) {
    onSelectedEventsChange(
      selectedEvents.includes(event) ? selectedEvents.filter((e) => e !== event) : [...selectedEvents, event],
    );
  }

  function toggleCategory(categoryEvents: string[]) {
    const allSelected = categoryEvents.every((e) => selectedEvents.includes(e));
    if (allSelected) {
      onSelectedEventsChange(selectedEvents.filter((e) => !categoryEvents.includes(e)));
    } else {
      onSelectedEventsChange([...selectedEvents, ...categoryEvents.filter((e) => !selectedEvents.includes(e))]);
    }
  }

  return (
    <div className="space-y-3">
      <Label>Events</Label>

      <label className="flex items-center gap-3 rounded-lg border border-blue-600/30 bg-blue-600/5 p-3 cursor-pointer">
        <Checkbox checked={wildcard} onCheckedChange={(checked) => onWildcardChange(!!checked)} />
        <div>
          <p className="text-sm font-medium">Subscribe to all events</p>
          <p className="text-xs text-muted-foreground">Includes all current and future event types</p>
        </div>
      </label>

      {!wildcard && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search events..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-5 w-24" />
                  <div className="ml-7 space-y-1">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredCategories.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {search ? 'No events match your search' : 'No events available'}
            </p>
          ) : (
            filteredCategories.map((category) => {
              const categoryEventNames = category.events.map((e) => e.name);
              const selectedCount = categoryEventNames.filter((e) => selectedEvents.includes(e)).length;
              const allSelected = selectedCount === categoryEventNames.length;
              const someSelected = selectedCount > 0 && !allSelected;

              return (
                <div key={category.label} className="space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <Checkbox
                      checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                      onCheckedChange={() => toggleCategory(categoryEventNames)}
                    />
                    <span className="text-sm font-semibold">{category.label}</span>
                  </label>
                  <div className="ml-7 space-y-1">
                    {category.events.map((event) => (
                      <label
                        key={event.name}
                        className="flex items-start gap-3 rounded-md p-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        <Checkbox
                          checked={selectedEvents.includes(event.name)}
                          onCheckedChange={() => toggleEvent(event.name)}
                          className="mt-0.5"
                        />
                        <div>
                          <p className="text-sm font-mono">{event.name}</p>
                          <p className="text-xs text-muted-foreground">{event.description}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
