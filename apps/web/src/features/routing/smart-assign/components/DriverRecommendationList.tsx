'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@sally/ui/components/ui/input';
import { Button } from '@sally/ui/components/ui/button';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { cn } from '@sally/ui';
import { useDriverRecommendations } from '@/features/routing/smart-assign';
import { DriverRecommendationCard } from './DriverRecommendationCard';
import type { DriverRecommendation } from '../types';

interface Props {
  loadId: string;
  selectedDriverId: string | null;
  onSelectDriver: (driverId: string) => void;
}

export function DriverRecommendationList({ loadId, selectedDriverId, onSelectDriver }: Props) {
  const { data, isLoading } = useDriverRecommendations(loadId);
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState('');

  const dataRecommendations = data?.recommendations;
  const recommendations: DriverRecommendation[] = useMemo(() => dataRecommendations ?? [], [dataRecommendations]);

  // Auto-select best match on first load
  useEffect(() => {
    if (!selectedDriverId && recommendations.length > 0) {
      const best = recommendations.find((r) => r.isBestMatch) ?? recommendations[0];
      onSelectDriver(best.driverId);
    }
  }, [recommendations, selectedDriverId, onSelectDriver]);

  const displayedDrivers = useMemo(() => {
    if (!expanded) return recommendations.slice(0, 3);
    if (!search.trim()) return recommendations;
    const q = search.toLowerCase();
    return recommendations.filter((r) => r.name.toLowerCase().includes(q));
  }, [expanded, search, recommendations]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-[72px] w-full rounded-lg" />
        <Skeleton className="h-[72px] w-full rounded-lg" />
        <Skeleton className="h-[72px] w-full rounded-lg" />
      </div>
    );
  }

  if (recommendations.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-2xs uppercase tracking-wider font-medium text-muted-foreground">Recommended Drivers</p>
        <p className="text-sm text-muted-foreground">No drivers available for this load.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-2xs uppercase tracking-wider font-medium text-muted-foreground">Recommended Drivers</p>

      {expanded && (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search drivers…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
      )}

      <div className="space-y-1.5">
        {displayedDrivers.map((driver) => (
          <div
            key={driver.driverId}
            className={cn('transition-opacity', expanded && search.trim() && !driver.equipmentMatch && 'opacity-50')}
          >
            <DriverRecommendationCard
              driver={driver}
              selected={selectedDriverId === driver.driverId}
              onSelect={() => onSelectDriver(driver.driverId)}
            />
          </div>
        ))}
      </div>

      {recommendations.length > 3 && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-muted-foreground h-7 text-xs"
          onClick={() => {
            setExpanded((prev) => !prev);
            setSearch('');
          }}
        >
          {expanded ? 'Show fewer' : `Show all ${recommendations.length} drivers`}
        </Button>
      )}
    </div>
  );
}
