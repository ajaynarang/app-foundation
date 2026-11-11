import { fieldError } from '@appshore/kernel/shared/errors/api-errors';
import { isStorableDate, parseSingleValue } from '@appshore/kernel/shared/utils/list-query';
import { QueryParam, QueryString } from '@appshore/kernel/shared/utils/query-dto';

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A `YYYY-MM-DD` calendar date kept as text, for a service that reads the day in the tenant's timezone. Anything
 * else is a 400 naming the param.
 */
export function QueryCalendarDate(name: string) {
  return QueryString({ name, pattern: CALENDAR_DATE, message: `"${name}" must be a YYYY-MM-DD date` });
}

/**
 * A date or instant kept as text (`2026-04-01`, `2026-04-01T00:00:00Z`), for a service that builds its own range
 * from it. A value that is not a date is a 400 naming the param, never an Invalid Date inside the query.
 */
export function QueryDateText(name?: string) {
  return QueryParam(
    (raw, wire) => {
      const value = parseSingleValue(raw, wire);
      if (value === undefined) return undefined;
      if (!isStorableDate(new Date(value))) throw fieldError(wire, `Invalid "${wire}" date`);
      return value;
    },
    { name },
    { type: String, description: 'ISO-8601 date or instant' },
  );
}
