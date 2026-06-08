'use client';

import { Bookmark, Bell, Trash2, ArrowRight } from 'lucide-react';
import { formatRelativeTime } from '@/shared/lib/utils/formatters';
import { Button } from '@sally/ui/components/ui/button';
import { Skeleton } from '@sally/ui/components/ui/skeleton';

import { ScrollArea } from '@sally/ui/components/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@sally/ui/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@sally/ui/components/ui/tooltip';
import { useSavedSearches, useToggleSavedSearch, useDeleteSavedSearch } from '../hooks/use-saved-searches';
import type { LoadBoardSearchParams } from '../types';

interface SavedSearchesTabProps {
  onRunSearch: (params: LoadBoardSearchParams) => void;
}

export function SavedSearchesTab({ onRunSearch }: SavedSearchesTabProps) {
  const { data: searches, isLoading } = useSavedSearches();
  const _toggleSearch = useToggleSavedSearch();
  const deleteSearch = useDeleteSavedSearch();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 px-6 py-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border p-4 space-y-2">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-6 w-16" />
            </div>
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
    );
  }

  if (!searches || searches.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <Bookmark className="h-12 w-12 text-muted-foreground/40" />
        <p className="text-sm font-medium text-foreground">No saved searches yet</p>
        <p className="text-xs text-muted-foreground max-w-sm">
          Search for loads first, then click &quot;Save this search&quot; to monitor that lane. You&apos;ll get notified
          when new matching loads are posted on DAT.
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="flex flex-col gap-2 px-6 py-3">
        {searches.map((search) => {
          const params = search.searchParams;
          const origin = params.origin ? `${params.origin.city}, ${params.origin.state}` : 'Any';
          const destination = params.destination
            ? `${params.destination.city}, ${params.destination.state}`
            : 'Anywhere';

          return (
            <div
              key={search.savedSearchId}
              className="group rounded-lg border border-border bg-card p-4 transition-colors hover:bg-gray-50 dark:hover:bg-gray-900"
            >
              <div className="flex items-start justify-between gap-3">
                <button type="button" className="flex-1 text-left min-w-0" onClick={() => onRunSearch(params)}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">{search.name}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <span>{origin}</span>
                    <ArrowRight className="h-3 w-3 shrink-0" />
                    <span>{destination}</span>
                  </div>
                  {search.minRate != null && (
                    <p className="mt-1 text-xs text-muted-foreground">Min rate: ${search.minRate.toLocaleString()}</p>
                  )}
                  <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span>
                      {search.lastMatchCount} match{search.lastMatchCount !== 1 ? 'es' : ''}
                    </span>
                    {search.lastPolledAt && <span>Checked {formatRelativeTime(search.lastPolledAt)}</span>}
                  </div>
                </button>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 opacity-50 cursor-not-allowed" disabled>
                        <Bell className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Set up alerts for this search</TooltipContent>
                  </Tooltip>

                  <AlertDialog>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                      </TooltipTrigger>
                      <TooltipContent>Delete</TooltipContent>
                    </Tooltip>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete saved search?</AlertDialogTitle>
                        <AlertDialogDescription>
                          &quot;{search.name}&quot; will be permanently removed. You will no longer receive alerts for
                          this lane.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => deleteSearch.mutate(search.savedSearchId)}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
