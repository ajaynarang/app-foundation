'use client';

import { LOAD_ROUTE_COLOR, RISK_BAND_DOT_TOKENS, RISK_BAND_LABELS } from '../../constants';
import type { RiskBand } from '@sally/shared-types';

const ORDER: RiskBand[] = ['on-track', 'at-risk', 'critical'];

/**
 * Legend in the bottom-left corner of the map. Pairs each marker color with
 * its band label so the colors are never the only signal. Sits above the
 * radar ledge so the two never overlap.
 */
export function MapLegend() {
  return (
    <div className="absolute bottom-[6.25rem] left-3 z-10 rounded-md border border-border bg-card/90 backdrop-blur-sm px-2.5 py-1.5 shadow-sm">
      <ul className="flex items-center gap-3 text-2xs">
        {ORDER.map((band) => (
          <li key={band} className="flex items-center gap-1.5 text-muted-foreground">
            <span
              className={`h-2.5 w-2.5 rounded-full ring-2 ring-background ${RISK_BAND_DOT_TOKENS[band]}`}
              aria-hidden
            />
            {RISK_BAND_LABELS[band]}
          </li>
        ))}
        <li className="flex items-center gap-1.5 text-muted-foreground">
          <span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: LOAD_ROUTE_COLOR }} aria-hidden />
          Selected route
        </li>
      </ul>
    </div>
  );
}
