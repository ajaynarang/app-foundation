export interface ConfirmationIssue {
  field: string;
  message: string;
}

export interface LoadForValidation {
  customerId: number | null | undefined;
  rateCents: number | null | undefined;
  referenceNumber: string | null | undefined;
  stops: Array<{
    actionType: string;
    city?: string | null;
    state?: string | null;
  }>;
}

/**
 * Validates that a load has all required fields to transition from DRAFT → PENDING.
 * Returns an array of issues. Empty array = ready for confirmation.
 *
 * Shared between backend (loads.service.ts) and frontend (LoadDetailPanel.tsx).
 * Keep this function pure — no framework dependencies.
 */
export function validateReadyForConfirmation(load: LoadForValidation): ConfirmationIssue[] {
  const issues: ConfirmationIssue[] = [];

  if (!load.customerId) {
    issues.push({ field: 'customerId', message: 'Customer is required' });
  }

  if (!load.rateCents || load.rateCents <= 0) {
    issues.push({ field: 'rateCents', message: 'Rate must be greater than $0' });
  }

  if (!load.referenceNumber?.trim()) {
    issues.push({ field: 'referenceNumber', message: 'Reference / PO # is required' });
  }

  const stops = load.stops ?? [];
  const hasPickup = stops.some((s) => s.actionType === 'pickup' || s.actionType === 'both');
  const hasDelivery = stops.some((s) => s.actionType === 'delivery' || s.actionType === 'both');

  if (!hasPickup || !hasDelivery) {
    issues.push({ field: 'stops', message: 'At least one pickup and one delivery stop are required' });
  }

  stops.forEach((stop, index) => {
    if (!stop.city?.trim()) {
      issues.push({ field: `stops[${index}].city`, message: `Stop ${index + 1} is missing city` });
    }
    if (!stop.state?.trim()) {
      issues.push({ field: `stops[${index}].state`, message: `Stop ${index + 1} is missing state` });
    }
  });

  return issues;
}
