import { UAParser } from 'ua-parser-js';

export const LOGIN_ACTIVITY = {
  SUMMARY_CACHE_TTL_SECONDS: 60,
  MAX_RANGE_DAYS: 90,
  MAX_PAGE_LIMIT: 100,
  DEFAULT_PAGE_LIMIT: 50,
  NOTABLE_LIST_CAP: 5,
  BRUTE_FORCE_FAIL_THRESHOLD: 5,
  NEW_IP_LOOKBACK_DAYS: 30,
  OFF_HOURS: { startHour: 6, endHour: 22 },
} as const;

export function parseDeviceLabel(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  try {
    const { browser, os } = new UAParser(userAgent).getResult();
    if (!browser.name && !os.name) return 'Unknown device';
    if (!browser.name) return os.name ?? 'Unknown device';
    if (!os.name) return browser.name;
    return `${browser.name} on ${os.name}`;
  } catch {
    return 'Unknown device';
  }
}
