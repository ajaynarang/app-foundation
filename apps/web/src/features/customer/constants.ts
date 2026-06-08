// Customer-facing status labels — uses friendly terms (no internal jargon like "dispatched")
export const STATUS_CONFIG: Record<
  string,
  { label: string; variant: 'default' | 'muted' | 'outline' | 'destructive' }
> = {
  ASSIGNED: { label: 'Booked', variant: 'outline' },
  DISPATCHED: { label: 'Booked', variant: 'outline' },
  IN_TRANSIT: { label: 'In Transit', variant: 'default' },
  DELIVERED: { label: 'Delivered', variant: 'default' },
  CANCELLED: { label: 'Cancelled', variant: 'destructive' },
  ON_HOLD: { label: 'On Hold', variant: 'destructive' },
};

export const EQUIPMENT_OPTIONS = [
  { value: 'dry_van', label: 'Dry Van' },
  { value: 'reefer', label: 'Reefer' },
  { value: 'flatbed', label: 'Flatbed' },
  { value: 'step_deck', label: 'Step Deck' },
] as const;

export const COMMODITY_OPTIONS = [
  { value: 'general', label: 'General' },
  { value: 'hazmat', label: 'Hazmat' },
  { value: 'refrigerated', label: 'Refrigerated' },
  { value: 'fragile', label: 'Fragile' },
] as const;

export function formatEquipment(type: string): string {
  return EQUIPMENT_OPTIONS.find((o) => o.value === type)?.label || type;
}

export function formatCommodity(type: string): string {
  return COMMODITY_OPTIONS.find((o) => o.value === type)?.label || type;
}
