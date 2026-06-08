'use client';

import { Package, MapPin } from 'lucide-react';
import { Badge } from '@sally/ui/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@sally/ui/components/ui/card';
import type { RoutePlanLoad } from '@/features/routing/route-planning';

interface LoadDetailsProps {
  loads: RoutePlanLoad[];
}

export function LoadDetails({ loads }: LoadDetailsProps) {
  if (!loads || loads.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Package className="h-4 w-4" />
          Loads ({loads.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loads.map((item) => {
          const load = item.load;
          return (
            <div key={item.id} className="p-3 rounded-md bg-muted/30 space-y-1.5">
              {/* Route: origin → destination (prominent) */}
              {load.stops && load.stops.length > 0 && (
                <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {load.stops.map((s: any, i: number) => (
                    <span key={i}>
                      {i > 0 && <span className="text-muted-foreground mx-1">→</span>}
                      {s.stop.city}, {s.stop.state}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-semibold text-foreground truncate">{load.customerName}</span>
                  <span className="text-xs text-muted-foreground font-mono">{load.loadNumber}</span>
                  {load.referenceNumber ? (
                    <span className="text-xs text-muted-foreground">{`Ref: ${load.referenceNumber}`}</span>
                  ) : null}
                  <Badge variant="outline" className="text-2xs px-1.5 py-0 flex-shrink-0">
                    {load.status}
                  </Badge>
                </div>
                {load.rateCents != null && load.rateCents > 0 && (
                  <span className="text-sm font-semibold text-foreground flex-shrink-0">
                    ${(load.rateCents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                )}
              </div>

              <div className="text-xs text-muted-foreground space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span>{load.commodityType}</span>
                  <span>&middot;</span>
                  <span>{load.weightLbs?.toLocaleString()} lbs</span>
                  {load.pieces && (
                    <>
                      <span>&middot;</span>
                      <span>{load.pieces} pcs</span>
                    </>
                  )}
                  {load.requiredEquipmentType && (
                    <>
                      <span>&middot;</span>
                      <span>{load.requiredEquipmentType.replace(/_/g, ' ')}</span>
                    </>
                  )}
                </div>

                {/* Stops route shown above — no duplicate here */}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
