'use client';

import { cn } from '@sally/ui';
import { formatRelativeTime } from '@/shared/lib/utils/formatters';
import type { LoadBoardListing } from '../types';

interface LoadBoardListingCardProps {
  listing: LoadBoardListing;
  isSelected: boolean;
  onClick: () => void;
}

export function LoadBoardListingCard({ listing, isSelected, onClick }: LoadBoardListingCardProps) {
  const {
    origin,
    destination,
    rate,
    ratePerMile,
    distance,
    deadheadMiles,
    equipmentType,
    weight,
    pickupDate,
    broker,
    postedAt,
  } = listing;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-lg border p-3 transition-colors cursor-pointer',
        isSelected ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/50',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-foreground">
          {origin.city}, {origin.state} → {destination.city}, {destination.state}
        </span>
        <span className="text-sm font-semibold text-foreground whitespace-nowrap">${rate.toLocaleString()}</span>
      </div>

      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        <span>{equipmentType}</span>
        {weight ? (
          <>
            <span>·</span>
            <span>{weight.toLocaleString()} lbs</span>
          </>
        ) : null}
        <span className="ml-auto flex items-center gap-1.5">
          ${ratePerMile.toFixed(2)}/mi
          {listing.laneInsight && (
            <span
              className={cn(
                'text-2xs font-medium px-1.5 py-0.5 rounded',
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
        </span>
      </div>

      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        <span>{distance.toLocaleString()} mi</span>
        {deadheadMiles != null ? (
          <>
            <span>·</span>
            <span>{deadheadMiles} mi DH</span>
          </>
        ) : null}
      </div>

      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        <span>{new Date(pickupDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
        <span>·</span>
        <span className="truncate max-w-[120px]">{broker.name}</span>
        <span>·</span>
        <span>{formatRelativeTime(postedAt)}</span>
      </div>
    </button>
  );
}
