'use client';

import { Popup } from 'react-map-gl/mapbox';
import { Button } from '@sally/ui/components/ui/button';
import type { RiskBand, RiskScore } from '@sally/shared-types';
import { RISK_BAND_LABELS, RISK_BAND_TOKENS } from '../../constants';
import type { MapTruckLocation } from '../../types';

interface InspectPopoverProps {
  truck: MapTruckLocation;
  band: RiskBand;
  score: RiskScore | undefined;
  onOpenLoad: (loadId: string) => void;
  onClose: () => void;
}

/**
 * Popover that opens when a truck marker is clicked. Shows driver, truck id,
 * band + a short reason, and a single "Open load" CTA.
 */
export function InspectPopover({ truck, band, score, onOpenLoad, onClose }: InspectPopoverProps) {
  return (
    <Popup
      longitude={truck.longitude}
      latitude={truck.latitude}
      anchor="bottom"
      offset={[0, -16]}
      closeOnClick={false}
      onClose={onClose}
      className="[&_.mapboxgl-popup-content]:!bg-card [&_.mapboxgl-popup-content]:!text-foreground [&_.mapboxgl-popup-content]:!p-3 [&_.mapboxgl-popup-content]:!rounded-md [&_.mapboxgl-popup-content]:!border [&_.mapboxgl-popup-content]:!border-border"
    >
      <div className="min-w-[200px] space-y-2">
        <div>
          <div className="text-sm font-semibold text-foreground">{truck.driverName ?? 'Unassigned'}</div>
          <div className="text-xs text-muted-foreground">{truck.vehicleIdentifier}</div>
        </div>
        <div className={`text-xs ${RISK_BAND_TOKENS[band]}`}>
          {RISK_BAND_LABELS[band]}
          {score != null && <span className="ml-1 text-muted-foreground">· score {score.score}</span>}
        </div>
        {truck.activeLoad && (
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => onOpenLoad(truck.activeLoad!.loadNumber)}
          >
            Open load
          </Button>
        )}
      </div>
    </Popup>
  );
}
