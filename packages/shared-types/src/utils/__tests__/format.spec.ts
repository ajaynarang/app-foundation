import { formatPriceCents, planDisplayName, getLowestIncludedPlan } from '../format';

describe('formatPriceCents', () => {
  it('formats whole-dollar amounts without decimals', () => {
    expect(formatPriceCents(2900)).toBe('$29/mo');
  });

  it('formats fractional amounts with two decimals', () => {
    expect(formatPriceCents(2999)).toBe('$29.99/mo');
  });

  it('returns Custom for null', () => {
    expect(formatPriceCents(null)).toBe('Custom');
  });

  it('honours a custom suffix', () => {
    expect(formatPriceCents(1000, '/yr')).toBe('$10/yr');
  });
});

describe('planDisplayName', () => {
  it('maps known plan keys to display names', () => {
    expect(planDisplayName('STARTER')).toBe('Starter');
    expect(planDisplayName('ENTERPRISE')).toBe('Enterprise');
  });

  it('falls back to the raw key for unknown plans', () => {
    expect(planDisplayName('UNKNOWN')).toBe('UNKNOWN');
  });
});

describe('getLowestIncludedPlan', () => {
  it('returns the lowest tier present in the list', () => {
    expect(getLowestIncludedPlan(['ENTERPRISE', 'PROFESSIONAL'])).toBe('PROFESSIONAL');
  });

  it('returns null when no known tier is present', () => {
    expect(getLowestIncludedPlan(['TRIAL'])).toBeNull();
  });
});
