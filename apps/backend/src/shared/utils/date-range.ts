/**
 * Build a Prisma-compatible date range filter object.
 * Adjusts `dateTo` to end-of-day (23:59:59.999) so the entire day is included.
 *
 * @returns A `{ gte?, lte? }` object for use in Prisma `where` clauses, or undefined if no dates provided.
 */
export function buildDateRangeFilter(dateFrom?: string, dateTo?: string): { gte?: Date; lte?: Date } | undefined {
  if (!dateFrom && !dateTo) return undefined;
  const filter: { gte?: Date; lte?: Date } = {};
  if (dateFrom) filter.gte = new Date(dateFrom);
  if (dateTo) {
    const to = new Date(dateTo);
    to.setHours(23, 59, 59, 999);
    filter.lte = to;
  }
  return filter;
}
