import { parseTimeOfDay, formatTimeOfDay } from './arrival-time';

describe('parseTimeOfDay', () => {
  it('parses HH:mm', () => {
    expect(parseTimeOfDay('08:00')).toBe('08:00:00');
  });

  it('parses HH:mm:ss', () => {
    expect(parseTimeOfDay('17:30:45')).toBe('17:30:45');
  });

  it('returns null for null/undefined', () => {
    expect(parseTimeOfDay(null)).toBeNull();
    expect(parseTimeOfDay(undefined)).toBeNull();
  });

  it('trims whitespace before parsing', () => {
    expect(parseTimeOfDay('  09:15  ')).toBe('09:15:00');
  });

  it('throws on invalid format', () => {
    expect(() => parseTimeOfDay('not a time')).toThrow();
    expect(() => parseTimeOfDay('9:00')).toThrow();
    expect(() => parseTimeOfDay('25:00')).toThrow();
    expect(() => parseTimeOfDay('12:60')).toThrow();
  });
});

describe('formatTimeOfDay', () => {
  it('formats a Prisma TIME Date to HH:mm', () => {
    // Prisma returns TIME as Date anchored at 1970-01-01T<time>Z
    const d = new Date('1970-01-01T08:30:00Z');
    expect(formatTimeOfDay(d)).toBe('08:30');
  });

  it('formats a TIME with seconds, dropping seconds', () => {
    const d = new Date('1970-01-01T17:30:45Z');
    expect(formatTimeOfDay(d)).toBe('17:30');
  });

  it('passes through a string ("HH:mm:ss" → "HH:mm")', () => {
    expect(formatTimeOfDay('08:00:00')).toBe('08:00');
    expect(formatTimeOfDay('17:30')).toBe('17:30');
  });

  it('returns null for null/undefined', () => {
    expect(formatTimeOfDay(null)).toBeNull();
    expect(formatTimeOfDay(undefined)).toBeNull();
  });
});
