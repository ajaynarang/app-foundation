'use client';

import { useMemo } from 'react';
import { ArrowLeft, MapPin, Truck, ChevronRight } from 'lucide-react';
import { cn } from '@sally/ui';
import { Button } from '@sally/ui/components/ui/button';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { ScrollArea } from '@sally/ui/components/ui/scroll-area';
import { LoadBoardListingCard } from './LoadBoardListingCard';
import type { LoadBoardListing } from '../types';
import type { DriverLoadRecommendation } from '../hooks/use-recommendations';

const INITIAL_LOADS = 3;

interface DriverRecommendationsViewProps {
  recommendations: DriverLoadRecommendation[];
  isLoading: boolean;
  selectedDriverId: string | null;
  onSelectDriver: (driverId: string | null) => void;
  onSelectListing: (listing: LoadBoardListing) => void;
  selectedListingId: string | null;
}

export function DriverRecommendationsView({
  recommendations,
  isLoading,
  selectedDriverId,
  onSelectDriver,
  onSelectListing,
  selectedListingId,
}: DriverRecommendationsViewProps) {
  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (recommendations.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <Truck className="h-12 w-12 text-muted-foreground/40" />
        <p className="text-sm font-medium text-foreground">No active drivers found</p>
        <p className="text-xs text-muted-foreground max-w-sm">
          Sally needs active drivers with recent location data to match loads. Make sure your fleet has telematics
          connected.
        </p>
      </div>
    );
  }

  // Single driver view
  if (selectedDriverId) {
    const rec = recommendations.find((r) => r.driver.id === selectedDriverId);
    if (!rec) {
      onSelectDriver(null);
      return null;
    }
    return (
      <SingleDriverView
        rec={rec}
        onBack={() => onSelectDriver(null)}
        onSelectListing={onSelectListing}
        selectedListingId={selectedListingId}
      />
    );
  }

  // All drivers view
  return (
    <AllDriversView
      recommendations={recommendations}
      onSelectDriver={onSelectDriver}
      onSelectListing={onSelectListing}
      selectedListingId={selectedListingId}
    />
  );
}

function AllDriversView({
  recommendations,
  onSelectDriver,
  onSelectListing,
  selectedListingId,
}: {
  recommendations: DriverLoadRecommendation[];
  onSelectDriver: (driverId: string) => void;
  onSelectListing: (listing: LoadBoardListing) => void;
  selectedListingId: string | null;
}) {
  // Sort: idle drivers first (red), then active (green)
  const sorted = useMemo(() => {
    return [...recommendations].sort((a, b) => {
      const aIdle = a.reason.toLowerCase().includes('idle') ? 0 : 1;
      const bIdle = b.reason.toLowerCase().includes('idle') ? 0 : 1;
      return aIdle - bIdle;
    });
  }, [recommendations]);

  const totalLoads = sorted.reduce((sum, r) => sum + r.listings.length, 0);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-border px-6 py-2">
        <span className="text-sm text-muted-foreground">
          {totalLoads} load{totalLoads !== 1 ? 's' : ''} near {sorted.length} driver{sorted.length !== 1 ? 's' : ''}
        </span>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-4 px-6 py-4">
          {sorted.map((rec) => (
            <DriverSection
              key={rec.driver.id}
              rec={rec}
              onViewAll={() => onSelectDriver(rec.driver.id)}
              onSelectListing={onSelectListing}
              selectedListingId={selectedListingId}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function DriverSection({
  rec,
  onViewAll,
  onSelectListing,
  selectedListingId,
}: {
  rec: DriverLoadRecommendation;
  onViewAll: () => void;
  onSelectListing: (listing: LoadBoardListing) => void;
  selectedListingId: string | null;
}) {
  const isIdle = rec.reason.toLowerCase().includes('idle');
  const initialListings = rec.listings.slice(0, INITIAL_LOADS);
  const hasMore = rec.listings.length > INITIAL_LOADS;

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Driver header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2.5">
          <span className={cn('h-2 w-2 rounded-full shrink-0', isIdle ? 'bg-red-500' : 'bg-green-500')} />
          <div>
            <span className="text-sm font-medium text-foreground">{rec.driver.name}</span>
            <div className="flex items-center gap-1 mt-0.5">
              <MapPin className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{rec.reason}</span>
            </div>
          </div>
        </div>
        <span className="text-xs text-muted-foreground">
          {rec.listings.length} load{rec.listings.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Compact load list */}
      <div className="divide-y divide-border">
        {initialListings.map((listing) => (
          <CompactLoadRow
            key={listing.externalId}
            listing={listing}
            isSelected={listing.externalId === selectedListingId}
            onClick={() => onSelectListing(listing)}
          />
        ))}
      </div>

      {/* View all */}
      {hasMore && (
        <button
          type="button"
          onClick={onViewAll}
          className="flex w-full items-center justify-center gap-1 px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground border-t border-border transition-colors"
        >
          See all {rec.listings.length} loads
          <ChevronRight className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function CompactLoadRow({
  listing,
  isSelected,
  onClick,
}: {
  listing: LoadBoardListing;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors',
        isSelected ? 'bg-primary/5' : 'hover:bg-muted/50',
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-sm text-foreground whitespace-nowrap">
          {listing.origin.city}, {listing.origin.state}
          <span className="text-muted-foreground mx-1">→</span>
          {listing.destination.city}, {listing.destination.state}
        </span>
        <span className="text-xs text-muted-foreground hidden sm:inline">{listing.equipmentType}</span>
        <span className="text-xs text-muted-foreground hidden md:inline">{listing.distance.toLocaleString()} mi</span>
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-3">
        {listing.laneInsight && (
          <span
            className={cn(
              'text-2xs font-medium px-1.5 py-0.5 rounded hidden sm:inline',
              listing.laneInsight.verdict === 'above_market' && 'bg-green-500/10 text-green-400',
              listing.laneInsight.verdict === 'market_rate' && 'bg-gray-500/10 text-gray-400',
              listing.laneInsight.verdict === 'below_market' && 'bg-yellow-500/10 text-yellow-400',
            )}
          >
            {listing.laneInsight.verdict === 'above_market' && `+${listing.laneInsight.percentDiff}%`}
            {listing.laneInsight.verdict === 'market_rate' && 'Avg'}
            {listing.laneInsight.verdict === 'below_market' && `${listing.laneInsight.percentDiff}%`}
          </span>
        )}
        <span className="text-sm font-medium text-foreground">${listing.ratePerMile.toFixed(2)}/mi</span>
      </div>
    </button>
  );
}

function SingleDriverView({
  rec,
  onBack,
  onSelectListing,
  selectedListingId,
}: {
  rec: DriverLoadRecommendation;
  onBack: () => void;
  onSelectListing: (listing: LoadBoardListing) => void;
  selectedListingId: string | null;
}) {
  const sorted = useMemo(() => [...rec.listings].sort((a, b) => b.ratePerMile - a.ratePerMile), [rec.listings]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-6 py-2.5">
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={onBack}>
          <ArrowLeft className="h-3 w-3" />
          All drivers
        </Button>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{rec.driver.name}</span>
          <span className="text-xs text-muted-foreground">
            {rec.driver.location.city}, {rec.driver.location.state}
          </span>
        </div>
        <span className="text-xs text-muted-foreground ml-auto">
          {sorted.length} load{sorted.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Full listing cards */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-2 px-6 py-3">
          {sorted.map((listing) => (
            <LoadBoardListingCard
              key={listing.externalId}
              listing={listing}
              isSelected={listing.externalId === selectedListingId}
              onClick={() => onSelectListing(listing)}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-6 py-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-2 w-2 rounded-full" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-3 w-48" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
