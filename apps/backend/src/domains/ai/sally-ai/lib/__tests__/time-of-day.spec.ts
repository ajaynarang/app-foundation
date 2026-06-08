import { classifyTimeOfDay } from '../time-of-day';

describe('classifyTimeOfDay', () => {
  it('returns morning before 11:00 in tenant timezone', () => {
    // 09:00 in America/Chicago = 14:00 UTC
    expect(classifyTimeOfDay(new Date('2026-04-13T14:00:00Z'), 'America/Chicago')).toBe('morning');
  });

  it('returns midday between 11:00 and 16:00', () => {
    expect(classifyTimeOfDay(new Date('2026-04-13T18:00:00Z'), 'America/Chicago')).toBe('midday');
  });

  it('returns evening at or after 16:00', () => {
    expect(classifyTimeOfDay(new Date('2026-04-13T22:00:00Z'), 'America/Chicago')).toBe('evening');
  });

  it('falls back to UTC bucketing when timezone is invalid', () => {
    expect(classifyTimeOfDay(new Date('2026-04-13T09:00:00Z'), 'Not/AReal_Zone')).toBe('morning');
  });
});
