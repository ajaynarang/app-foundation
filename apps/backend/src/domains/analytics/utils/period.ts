import { GroupByPeriod } from '../dto/report-query.dto';

/**
 * Convert a date to a period key string based on the groupBy setting.
 * Used across report services for consistent time-series grouping.
 */
export function getPeriodKey(date: Date, groupBy: GroupByPeriod): string {
  const d = new Date(date);
  switch (groupBy) {
    case GroupByPeriod.DAY:
      return d.toISOString().split('T')[0];
    case GroupByPeriod.WEEK: {
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d);
      monday.setDate(diff);
      return monday.toISOString().split('T')[0];
    }
    case GroupByPeriod.MONTH:
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
}
