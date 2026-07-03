/* global describe, it, expect */
import {
  formatCalendarDate,
  parseCalendarDate,
  formatTimestamp,
  isCalendarDateString,
  compareCalendarDates,
  calendarDateToDate,
  dateToCalendarDate,
} from '../date-utils';

describe('isCalendarDateString', () => {
  it('returns true for YYYY-MM-DD strings', () => {
    expect(isCalendarDateString('2026-02-28')).toBe(true);
    expect(isCalendarDateString('2026-01-01')).toBe(true);
  });

  it('returns false for ISO timestamps', () => {
    expect(isCalendarDateString('2026-02-28T00:00:00.000Z')).toBe(false);
    expect(isCalendarDateString('2026-02-28T15:30:00Z')).toBe(false);
  });

  it('returns false for invalid strings', () => {
    expect(isCalendarDateString('')).toBe(false);
    expect(isCalendarDateString('not-a-date')).toBe(false);
    expect(isCalendarDateString('02/28/2026')).toBe(false);
  });
});

describe('parseCalendarDate', () => {
  it('parses YYYY-MM-DD into year/month/day components', () => {
    const result = parseCalendarDate('2026-02-28');
    expect(result).toEqual({ year: 2026, month: 2, day: 28 });
  });

  it('parses single-digit months and days', () => {
    const result = parseCalendarDate('2026-01-05');
    expect(result).toEqual({ year: 2026, month: 1, day: 5 });
  });

  it('handles ISO timestamp by extracting date portion', () => {
    const result = parseCalendarDate('2026-02-28T15:30:00Z');
    expect(result).toEqual({ year: 2026, month: 2, day: 28 });
  });
});

describe('formatCalendarDate', () => {
  it('formats as MM/DD/YYYY by default', () => {
    expect(formatCalendarDate('2026-02-28')).toBe('02/28/2026');
  });

  it('formats as DD/MM/YYYY', () => {
    expect(formatCalendarDate('2026-02-28', 'DD/MM/YYYY')).toBe('28/02/2026');
  });

  it('formats as YYYY-MM-DD', () => {
    expect(formatCalendarDate('2026-02-28', 'YYYY-MM-DD')).toBe('2026-02-28');
  });

  it('formats as MMM d', () => {
    expect(formatCalendarDate('2026-02-28', 'MMM d')).toBe('Feb 28');
  });

  it('formats as MMM d, yyyy', () => {
    expect(formatCalendarDate('2026-02-28', 'MMM d, yyyy')).toBe('Feb 28, 2026');
  });

  it('returns em-dash for null/undefined', () => {
    expect(formatCalendarDate(null)).toBe('—');
    expect(formatCalendarDate(undefined)).toBe('—');
    expect(formatCalendarDate('')).toBe('—');
  });

  it('returns Feb 28 regardless of timezone (the key bug fix test)', () => {
    const result = formatCalendarDate('2026-02-28', 'MMM d, yyyy');
    expect(result).toBe('Feb 28, 2026');
  });
});

describe('compareCalendarDates', () => {
  it('returns negative when first is before second', () => {
    expect(compareCalendarDates('2026-02-27', '2026-02-28')).toBeLessThan(0);
  });

  it('returns positive when first is after second', () => {
    expect(compareCalendarDates('2026-03-01', '2026-02-28')).toBeGreaterThan(0);
  });

  it('returns 0 when dates are equal', () => {
    expect(compareCalendarDates('2026-02-28', '2026-02-28')).toBe(0);
  });
});

describe('formatTimestamp', () => {
  it('formats a UTC timestamp in a given timezone', () => {
    const result = formatTimestamp('2026-02-28T20:30:00.000Z', 'America/New_York');
    expect(result).toContain('3:30');
    expect(result).toContain('PM');
  });

  it('formats with explicit format string', () => {
    const result = formatTimestamp('2026-02-28T20:30:00.000Z', 'America/New_York', 'MMM d, yyyy');
    expect(result).toBe('Feb 28, 2026');
  });

  it('returns em-dash for null/undefined', () => {
    expect(formatTimestamp(null, 'America/New_York')).toBe('—');
    expect(formatTimestamp(undefined, 'America/New_York')).toBe('—');
  });
});

describe('calendarDateToDate', () => {
  it('returns a Date at noon to prevent day-shift', () => {
    const d = calendarDateToDate('2026-02-28');
    expect(d.getDate()).toBe(28);
    expect(d.getMonth()).toBe(1); // 0-indexed
    expect(d.getFullYear()).toBe(2026);
  });
});

describe('dateToCalendarDate', () => {
  it('converts a Date back to YYYY-MM-DD', () => {
    const d = new Date(2026, 1, 28); // Feb 28
    expect(dateToCalendarDate(d)).toBe('2026-02-28');
  });
});

describe('edge cases', () => {
  it('formatCalendarDate returns em-dash for malformed input', () => {
    expect(formatCalendarDate('garbage')).toBe('—');
    expect(formatCalendarDate('not-a-date')).toBe('—');
  });

  it('formatCalendarDate handles leap year', () => {
    expect(formatCalendarDate('2024-02-29', 'MMM d, yyyy')).toBe('Feb 29, 2024');
  });

  it('formatCalendarDate handles year boundary', () => {
    expect(formatCalendarDate('2025-12-31', 'MMM d, yyyy')).toBe('Dec 31, 2025');
    expect(formatCalendarDate('2026-01-01', 'MMM d, yyyy')).toBe('Jan 1, 2026');
  });

  it('formatTimestamp returns em-dash for malformed input', () => {
    expect(formatTimestamp('garbage', 'America/New_York')).toBe('—');
  });

  it('calendarDateToDate roundtrips with dateToCalendarDate', () => {
    const original = '2026-02-28';
    const date = calendarDateToDate(original);
    expect(dateToCalendarDate(date)).toBe(original);
  });
});
