import { parseDeviceLabel, LOGIN_ACTIVITY } from '../constants';

describe('parseDeviceLabel', () => {
  it('returns "Chrome on macOS" for a Mac/Chrome UA', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    expect(parseDeviceLabel(ua)).toBe('Chrome on macOS');
  });

  it('returns "Mobile Safari on iOS" for an iPhone UA', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
    expect(parseDeviceLabel(ua)).toBe('Mobile Safari on iOS');
  });

  it('returns null for empty input', () => {
    expect(parseDeviceLabel(null)).toBeNull();
    expect(parseDeviceLabel(undefined)).toBeNull();
    expect(parseDeviceLabel('')).toBeNull();
  });

  it('returns "Unknown device" when parsing fails to extract anything useful', () => {
    expect(parseDeviceLabel('garbage')).toBe('Unknown device');
  });

  it('falls back to OS name when browser is missing', () => {
    const ua = 'curl/8.4.0';
    const out = parseDeviceLabel(ua);
    expect(out).toBeTruthy();
    expect(typeof out).toBe('string');
  });
});

describe('LOGIN_ACTIVITY constants', () => {
  it('exposes off-hours window of 6..22 local hours', () => {
    expect(LOGIN_ACTIVITY.OFF_HOURS.startHour).toBe(6);
    expect(LOGIN_ACTIVITY.OFF_HOURS.endHour).toBe(22);
  });

  it('has sane summary cache TTL of 60s', () => {
    expect(LOGIN_ACTIVITY.SUMMARY_CACHE_TTL_SECONDS).toBe(60);
  });

  it('caps the date range at 90 days and pagination at 100 rows', () => {
    expect(LOGIN_ACTIVITY.MAX_RANGE_DAYS).toBe(90);
    expect(LOGIN_ACTIVITY.MAX_PAGE_LIMIT).toBe(100);
    expect(LOGIN_ACTIVITY.DEFAULT_PAGE_LIMIT).toBe(50);
  });

  it('caps Notable lists at 5 and brute-force at 5 fails', () => {
    expect(LOGIN_ACTIVITY.NOTABLE_LIST_CAP).toBe(5);
    expect(LOGIN_ACTIVITY.BRUTE_FORCE_FAIL_THRESHOLD).toBe(5);
    expect(LOGIN_ACTIVITY.NEW_IP_LOOKBACK_DAYS).toBe(30);
  });
});
