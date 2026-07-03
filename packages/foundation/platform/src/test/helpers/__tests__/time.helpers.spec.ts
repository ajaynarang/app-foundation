import {
  hoursMs,
  minutesMs,
  daysMs,
  hoursAgo,
  minutesAgo,
  daysAgo,
  hoursFromNow,
  daysFromNow,
  dateOnly,
  farFuture,
  recent,
} from '../time.helpers';

describe('Time Helpers', () => {
  describe('duration converters', () => {
    it('hoursMs converts hours to milliseconds', () => {
      expect(hoursMs(1)).toBe(3_600_000);
      expect(hoursMs(2)).toBe(7_200_000);
      expect(hoursMs(0)).toBe(0);
    });

    it('minutesMs converts minutes to milliseconds', () => {
      expect(minutesMs(1)).toBe(60_000);
      expect(minutesMs(30)).toBe(1_800_000);
      expect(minutesMs(0)).toBe(0);
    });

    it('daysMs converts days to milliseconds', () => {
      expect(daysMs(1)).toBe(86_400_000);
      expect(daysMs(7)).toBe(604_800_000);
      expect(daysMs(0)).toBe(0);
    });
  });

  describe('relative date creators', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-01-15T12:00:00.000Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('hoursAgo returns a date N hours in the past', () => {
      const result = hoursAgo(2);
      expect(result.toISOString()).toBe('2026-01-15T10:00:00.000Z');
    });

    it('minutesAgo returns a date N minutes in the past', () => {
      const result = minutesAgo(30);
      expect(result.toISOString()).toBe('2026-01-15T11:30:00.000Z');
    });

    it('daysAgo returns a date N days in the past', () => {
      const result = daysAgo(3);
      expect(result.toISOString()).toBe('2026-01-12T12:00:00.000Z');
    });

    it('hoursFromNow returns a date N hours in the future', () => {
      const result = hoursFromNow(5);
      expect(result.toISOString()).toBe('2026-01-15T17:00:00.000Z');
    });

    it('daysFromNow returns a date N days in the future', () => {
      const result = daysFromNow(10);
      expect(result.toISOString()).toBe('2026-01-25T12:00:00.000Z');
    });

    it('farFuture returns a date 90 days from now', () => {
      const result = farFuture();
      expect(result.toISOString()).toBe('2026-04-15T12:00:00.000Z');
    });

    it('recent returns a date 7 days ago', () => {
      const result = recent();
      expect(result.toISOString()).toBe('2026-01-08T12:00:00.000Z');
    });
  });

  describe('dateOnly', () => {
    it('extracts YYYY-MM-DD from a Date object', () => {
      expect(dateOnly(new Date('2026-03-15T14:30:00.000Z'))).toBe('2026-03-15');
    });

    it('works for midnight UTC', () => {
      expect(dateOnly(new Date('2026-01-01T00:00:00.000Z'))).toBe('2026-01-01');
    });
  });
});
