'use client';

import { useState, useEffect, useMemo } from 'react';
import { ChevronDown, ChevronUp, MapPin, Truck, Sparkles, RefreshCw } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import type { DriverLoadRecommendation } from '../hooks/use-recommendations';
import type { LoadBoardListing } from '../types';

interface RecommendationsBannerProps {
  recommendations: DriverLoadRecommendation[];
  isLoading?: boolean;
  hasSearched: boolean;
  onSelect: (listing: LoadBoardListing) => void;
  onRequestMatches: () => void;
  hasRequested: boolean;
}

export function RecommendationsBanner({
  recommendations,
  isLoading,
  hasSearched,
  onSelect,
  onRequestMatches,
  hasRequested,
}: RecommendationsBannerProps) {
  const [expanded, setExpanded] = useState(false);

  // Auto-collapse when dispatcher searches
  useEffect(() => {
    if (hasSearched) {
      setExpanded(false);
    }
  }, [hasSearched]);

  // Cap at 3 drivers x 3 loads each
  const cappedRecs = useMemo(
    () =>
      recommendations.slice(0, 3).map((rec) => ({
        ...rec,
        listings: rec.listings.slice(0, 3),
      })),
    [recommendations],
  );

  const totalLoads = cappedRecs.reduce((sum, rec) => sum + rec.listings.length, 0);

  const hasRecs = cappedRecs.length > 0 && totalLoads > 0;

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Header bar */}
      <div className="flex w-full items-center justify-between px-4 py-2">
        <button
          type="button"
          onClick={() => hasRecs && setExpanded((prev) => !prev)}
          className="flex items-center gap-2 text-sm hover:opacity-80 transition-opacity"
        >
          <Truck className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-medium text-foreground">Smart Matching</span>
          {isLoading ? (
            <span className="text-xs text-muted-foreground">Scanning driver locations...</span>
          ) : hasRecs ? (
            <span className="text-xs text-muted-foreground">
              {totalLoads} load{totalLoads !== 1 ? 's' : ''} near {cappedRecs.length} driver
              {cappedRecs.length !== 1 ? 's' : ''}
            </span>
          ) : hasRequested ? (
            <span className="text-xs text-muted-foreground">No matches found near your drivers right now</span>
          ) : (
            <span className="text-xs text-muted-foreground">Find loads near your active drivers</span>
          )}
          {hasRecs &&
            (expanded ? (
              <ChevronUp className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            ))}
        </button>

        {/* Action button */}
        {!hasRequested && !isLoading && (
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onRequestMatches}>
            <Sparkles className="mr-1 h-3 w-3" />
            Find Matches
          </Button>
        )}
        {hasRequested && !isLoading && (
          <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={onRequestMatches}>
            <RefreshCw className="mr-1 h-3 w-3" />
            Refresh
          </Button>
        )}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="border-t border-border px-4 py-3 space-y-2">
          <Skeleton className="h-4 w-48" />
          <div className="flex gap-2">
            <Skeleton className="h-16 w-[200px]" />
            <Skeleton className="h-16 w-[200px]" />
            <Skeleton className="h-16 w-[200px]" />
          </div>
        </div>
      )}

      {/* Expanded content */}
      {expanded && hasRecs && !isLoading && (
        <div className="border-t border-border px-4 py-3 space-y-3">
          {cappedRecs.map((rec) => (
            <div key={rec.driver.id}>
              {/* Driver header */}
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">{rec.driver.name}</span>
                <span className="text-xs text-muted-foreground">{rec.reason}</span>
              </div>

              {/* Compact horizontal cards */}
              <div className="flex gap-2 overflow-x-auto pb-1">
                {rec.listings.map((listing) => (
                  <CompactListingCard key={listing.externalId} listing={listing} onSelect={() => onSelect(listing)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CompactListingCard({ listing, onSelect }: { listing: LoadBoardListing; onSelect: () => void }) {
  return (
    <Button
      variant="outline"
      className="flex h-auto min-w-[200px] flex-col items-start gap-0.5 rounded-md border border-border bg-card px-3 py-2 text-left hover:bg-muted/50 dark:hover:bg-muted/30"
      onClick={onSelect}
    >
      <span className="text-xs font-medium text-foreground">
        {listing.origin.city}, {listing.origin.state} <span className="text-muted-foreground">&rarr;</span>{' '}
        {listing.destination.city}, {listing.destination.state}
      </span>
      <span className="flex w-full items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{listing.equipmentType}</span>
        <span className="font-medium text-foreground">${listing.ratePerMile.toFixed(2)}/mi</span>
      </span>
      <span className="text-xs text-muted-foreground">
        {listing.distance.toLocaleString()} mi
        {listing.deadheadMiles != null && ` | ${listing.deadheadMiles} mi DH`}
      </span>
    </Button>
  );
}
