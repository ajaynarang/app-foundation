'use client';

import { Badge } from '@sally/ui/components/ui/badge';
import { SEMANTIC_COLORS } from '@/shared/lib/colors';
import type { MockRoute } from '../../engine/types';

const statusBadge: Record<string, string> = {
  in_progress: `${SEMANTIC_COLORS.info.bg} ${SEMANTIC_COLORS.info.text}`,
  planned: `${SEMANTIC_COLORS.info.bg} ${SEMANTIC_COLORS.info.text}`,
  completed: `${SEMANTIC_COLORS.neutral.bg} ${SEMANTIC_COLORS.neutral.text}`,
};

export function RouteCard({ data }: { data: Record<string, unknown> }) {
  // Multiple routes
  if (Array.isArray(data.routes)) {
    const routes = data.routes as MockRoute[];
    return (
      <div className="space-y-2">
        {routes.map((route) => (
          <div key={route.id} className="rounded-lg border border-border bg-card p-2 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">{route.id}</span>
              <Badge className={`${statusBadge[route.status]} text-2xs px-1.5 py-0`}>
                {route.status.replace('_', ' ')}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {route.origin} → {route.destination}
            </p>
            <div className="flex gap-3 text-2xs text-muted-foreground">
              <span>{route.stops} stops</span>
              <span>ETA: {route.eta}</span>
              {route.driver && <span>{route.driver}</span>}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Single route
  const route = data as unknown as MockRoute;
  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">{route.id}</span>
        <Badge className={statusBadge[route.status]}>{route.status.replace('_', ' ')}</Badge>
      </div>
      <div className="text-xs text-muted-foreground space-y-1">
        <p className="text-foreground font-medium">
          {route.origin} → {route.destination}
        </p>
        <div className="flex gap-4">
          <span>{route.stops} stops</span>
          <span>ETA: {route.eta}</span>
        </div>
        {route.driver && <p>Driver: {route.driver}</p>}
      </div>
    </div>
  );
}
