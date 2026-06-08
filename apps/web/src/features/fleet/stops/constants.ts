export const LOCATION_TYPES = [
  { value: 'WAREHOUSE', label: 'Warehouse' },
  { value: 'DISTRIBUTION_CENTER', label: 'Distribution Center' },
  { value: 'TRUCK_STOP', label: 'Truck Stop' },
  { value: 'FUEL_STATION', label: 'Fuel Station' },
  { value: 'REST_AREA', label: 'Rest Area' },
  { value: 'PORT', label: 'Port' },
  { value: 'RAIL_YARD', label: 'Rail Yard' },
  { value: 'OTHER', label: 'Other' },
] as const;

export const LOCATION_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  LOCATION_TYPES.map((t) => [t.value, t.label]),
);
