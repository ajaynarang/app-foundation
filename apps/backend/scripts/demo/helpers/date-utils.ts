// Demo Data Engine — Date Utilities

/**
 * Returns a Date representing N days ago from now.
 */
export function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

/**
 * Returns a Date representing N days from now.
 */
export function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

/**
 * Returns a random Date between start and end, using the provided RNG.
 */
export function randomDate(start: Date, end: Date, rng: () => number): Date {
  const startTime = start.getTime();
  const endTime = end.getTime();
  const randomTime = startTime + rng() * (endTime - startTime);
  return new Date(randomTime);
}

/**
 * Adds hours to a Date, returning a new Date.
 */
export function addHours(date: Date, h: number): Date {
  return new Date(date.getTime() + h * 60 * 60 * 1000);
}

/**
 * Adds minutes to a Date, returning a new Date.
 */
export function addMinutes(date: Date, m: number): Date {
  return new Date(date.getTime() + m * 60 * 1000);
}

/**
 * Returns true if the date is a weekday (Mon-Fri).
 */
export function isBusinessDay(date: Date): boolean {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

/**
 * Returns the next business day (Mon-Fri). If the given date is already
 * a business day, returns the next one.
 */
export function nextBusinessDay(date: Date): Date {
  const result = new Date(date);
  do {
    result.setDate(result.getDate() + 1);
  } while (!isBusinessDay(result));
  return result;
}

/**
 * Returns the start of the week (Monday 00:00:00) for the given date.
 */
export function startOfWeek(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday = 1
  result.setDate(result.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Returns the end of the week (Sunday 23:59:59) for the given date.
 */
export function endOfWeek(date: Date): Date {
  const result = startOfWeek(date);
  result.setDate(result.getDate() + 6);
  result.setHours(23, 59, 59, 999);
  return result;
}
