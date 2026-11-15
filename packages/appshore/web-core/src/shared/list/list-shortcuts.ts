import type { SortOption } from '@app/ui/components/ui/sort-button';

/**
 * Small pieces several lists repeat word for word — kept here so each screen states only what is its own.
 */

/** The two named sorts on a list read by date. */
export type DateSort = 'newest' | 'oldest';

export const DATE_SORT_OPTIONS: (SortOption & { value: DateSort; defaultOrder: 'asc' | 'desc' })[] = [
  { value: 'newest', label: 'Newest', defaultOrder: 'desc' },
  { value: 'oldest', label: 'Oldest', defaultOrder: 'asc' },
];

/** The arrow `SortButton` shows for each named sort. */
export const DATE_SORT_ORDER: Record<DateSort, 'asc' | 'desc'> = { newest: 'desc', oldest: 'asc' };

/** Picking the active sort again flips it — with named sorts that is the other name (`toggleNamedSort`). */
export const DATE_SORT_OPPOSITE: Record<DateSort, DateSort> = { newest: 'oldest', oldest: 'newest' };

/**
 * The number beside each pivot segment, from the server's per-status `counts`: a segment that stands for
 * several statuses sums them, and a segment mapped to `undefined` ("All") sums every status. Never counted
 * from the loaded rows.
 */
export function segmentCounts<P extends string, K extends string>(
  counts: Partial<Record<K, number>> | undefined,
  statusesBySegment: Record<P, readonly K[] | undefined>,
  allStatuses: readonly K[],
): Partial<Record<P, number>> | undefined {
  if (!counts) return undefined;
  const sum = (statuses: readonly K[]) => statuses.reduce((total, status) => total + (counts[status] ?? 0), 0);
  return Object.fromEntries(
    (Object.entries(statusesBySegment) as [P, readonly K[] | undefined][]).map(([segment, statuses]) => [
      segment,
      sum(statuses ?? allStatuses),
    ]),
  ) as Partial<Record<P, number>>;
}

/**
 * A SHORT list's search, in the browser — members, invitations, API keys, OAuth clients, payment methods,
 * webhooks: lists one tenant keeps to a handful, fetched whole. Case-insensitive; a row matches when any of
 * its fields contains the term. A list that grows goes to the server instead — never this.
 */
export function matchesSearch(term: string, fields: ReadonlyArray<string | null | undefined>): boolean {
  const needle = term.trim().toLowerCase();
  if (!needle) return true;
  return fields.some((field) => field?.toLowerCase().includes(needle));
}
