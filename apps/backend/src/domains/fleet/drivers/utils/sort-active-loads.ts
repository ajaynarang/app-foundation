/**
 * Sort active loads by priority: in_transit first, then by earliest pickup date,
 * then by assignedAt as tiebreaker (first assigned = higher priority).
 */
export function sortActiveLoads<
  T extends {
    status: string;
    pickupDate?: any;
    assignedAt?: any;
    createdAt?: any;
  },
>(loads: T[]): T[] {
  return [...loads].sort((a, b) => {
    // in_transit always comes first
    if (a.status === 'IN_TRANSIT' && b.status !== 'IN_TRANSIT') return -1;
    if (b.status === 'IN_TRANSIT' && a.status !== 'IN_TRANSIT') return 1;
    // Sort by pickupDate ASC
    const aPickup = a.pickupDate ? new Date(a.pickupDate).getTime() : Infinity;
    const bPickup = b.pickupDate ? new Date(b.pickupDate).getTime() : Infinity;
    if (aPickup !== bPickup) return aPickup - bPickup;
    // Tiebreaker: assignedAt ASC (first assigned = first active)
    const aAssigned = a.assignedAt
      ? new Date(a.assignedAt).getTime()
      : a.createdAt
        ? new Date(a.createdAt).getTime()
        : Infinity;
    const bAssigned = b.assignedAt
      ? new Date(b.assignedAt).getTime()
      : b.createdAt
        ? new Date(b.createdAt).getTime()
        : Infinity;
    return aAssigned - bAssigned;
  });
}
