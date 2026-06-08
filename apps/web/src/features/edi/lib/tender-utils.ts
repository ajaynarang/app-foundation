export function getRateColor(ratePerMile: number): string {
  if (ratePerMile >= 3.0) return 'text-emerald-400';
  if (ratePerMile >= 2.5) return 'text-amber-400';
  return 'text-red-400';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function deriveTenderRoute(tender: any) {
  const stops = tender.parsedData?.stops ?? tender.load?.stops ?? [];
  const pickup =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stops.find((s: any) => s.actionType === 'pickup') ?? stops[0];
  const delivery =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stops.find((s: any) => s.actionType === 'delivery') ?? stops[stops.length - 1];

  return {
    origin: pickup
      ? `${pickup.city}, ${pickup.state}`
      : tender.load?.originCity
        ? `${tender.load.originCity}, ${tender.load.originState}`
        : 'Unknown',
    destination: delivery
      ? `${delivery.city}, ${delivery.state}`
      : tender.load?.destinationCity
        ? `${tender.load.destinationCity}, ${tender.load.destinationState}`
        : 'Unknown',
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function computeRatePerMile(tender: any): number {
  const rateCents = tender.parsedData?.rateCents ?? tender.load?.rateCents ?? 0;
  const miles = tender.load?.estimatedMiles ?? 300; // fallback
  return miles > 0 ? rateCents / 100 / miles : 0;
}
