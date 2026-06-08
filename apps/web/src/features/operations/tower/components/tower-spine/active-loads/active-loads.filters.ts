import type { ActiveLoadView, RiskBand } from '@sally/shared-types';
import { matchesRiskFilter, type RiskFilter } from '../../../constants';

/** An active load joined with its risk band, unread count, and alert flag. */
export interface ActiveLoadEntry {
  load: ActiveLoadView;
  riskBand: RiskBand;
  unreadCount: number;
  hasActiveAlert: boolean;
}

/**
 * Filters active-load entries by the canvas-wide risk filter and a free-text
 * search. Risk is the only triage axis on Tower — there is no load-category
 * (planned/manual) filter; assignment provenance is not a live-ops concern.
 */
export function filterLoads(rows: ActiveLoadEntry[], risk: RiskFilter, search: string): ActiveLoadEntry[] {
  const byRisk = rows.filter((row) => matchesRiskFilter(row.riskBand, risk));
  const term = search.trim().toLowerCase();
  if (!term) return byRisk;
  return byRisk.filter((row) => matchesSearch(row, term));
}

function matchesSearch(row: ActiveLoadEntry, term: string): boolean {
  const { loadNumber, referenceNumber, customerName, driver } = row.load;
  return (
    loadNumber.toLowerCase().includes(term) ||
    (referenceNumber ?? '').toLowerCase().includes(term) ||
    (customerName ?? '').toLowerCase().includes(term) ||
    driver.name.toLowerCase().includes(term)
  );
}
