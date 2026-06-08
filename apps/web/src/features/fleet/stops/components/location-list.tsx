'use client';

import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@sally/ui/components/ui/table';
import { Button } from '@sally/ui/components/ui/button';
import { Badge } from '@sally/ui/components/ui/badge';
import { Input } from '@sally/ui/components/ui/input';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { MapPin, Plus, Search } from 'lucide-react';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { useLocations } from '../hooks/use-locations';
import { LocationDetailSheet } from './location-detail-sheet';
import { CreateLocationSheet } from './create-location-sheet';
import { LOCATION_TYPES, LOCATION_TYPE_LABELS } from '../constants';

interface LocationListProps {
  /** When the page toolbar hosts Add Location, hide the inline button. */
  actionsInToolbar?: boolean;
  createOpen?: boolean;
  onCreateOpenChange?: (open: boolean) => void;
}

export function LocationList({
  actionsInToolbar = false,
  createOpen: createOpenProp,
  onCreateOpenChange,
}: LocationListProps = {}) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createOpenInternal, setCreateOpenInternal] = useState(false);
  const createOpen = createOpenProp ?? createOpenInternal;
  const setCreateOpen = onCreateOpenChange ?? setCreateOpenInternal;

  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading } = useLocations({
    page,
    limit: 25,
    q: debouncedSearch || undefined,
    type: typeFilter || undefined,
  });

  const items = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search locations..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9"
            />
          </div>
          <Select
            value={typeFilter}
            onValueChange={(v) => {
              setTypeFilter(v === 'all' ? '' : v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {LOCATION_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {!actionsInToolbar && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Location
          </Button>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <MapPin className="h-8 w-8 mb-2" />
          <p className="text-sm">{search ? 'No locations match your search' : 'No locations yet'}</p>
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Address</TableHead>
                <TableHead>City / State</TableHead>
                <TableHead className="hidden md:table-cell">Type</TableHead>
                <TableHead className="hidden lg:table-cell">Contact</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((stop) => (
                <TableRow key={stop.id} className="cursor-pointer" onClick={() => setSelectedId(stop.id)}>
                  <TableCell className="font-medium">{stop.name}</TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">{stop.address || '—'}</TableCell>
                  <TableCell>{[stop.city, stop.state].filter(Boolean).join(', ') || '—'}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant="outline" className="text-xs">
                      {LOCATION_TYPE_LABELS[stop.locationType] || stop.locationType}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground">
                    {stop.contactName || '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages} ({data?.total ?? 0} locations)
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Detail sheet */}
      <LocationDetailSheet
        locationId={selectedId}
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      />

      {/* Create sheet */}
      <CreateLocationSheet open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
