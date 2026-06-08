'use client';

interface MapStaleBannerProps {
  ageMs: number;
}

/**
 * Red-soft banner at the top of the map when the truck positions haven't
 * been updated in a while. Driven by useStaleMapDetector.
 */
export function MapStaleBanner({ ageMs }: MapStaleBannerProps) {
  const minutes = Math.max(1, Math.round(ageMs / 60_000));
  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute top-0 left-0 right-0 z-20 border-b border-red-500/40 bg-red-500/10 px-3 py-1.5 text-center text-xs text-red-700 dark:text-red-300"
    >
      Truck positions paused — last update {minutes} min ago
    </div>
  );
}
