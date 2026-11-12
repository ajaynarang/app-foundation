import {
  DATE_SORT_OPPOSITE,
  DATE_SORT_ORDER,
  matchesSearch,
  segmentCounts,
} from '@appshore/web-core/shared/list/list-shortcuts';

describe('list shortcuts', () => {
  it('pairs each date sort with its arrow and its opposite', () => {
    expect(DATE_SORT_ORDER).toEqual({ newest: 'desc', oldest: 'asc' });
    expect(DATE_SORT_OPPOSITE.newest).toBe('oldest');
    expect(DATE_SORT_OPPOSITE.oldest).toBe('newest');
  });

  it('counts each segment from the server counts — sums for grouped segments, everything for All', () => {
    const counts = { OPEN: 2, PAID: 5, VOID: 1 };
    expect(
      segmentCounts(counts, { OPEN: ['OPEN'], SETTLED: ['PAID', 'VOID'], ALL: undefined }, ['OPEN', 'PAID', 'VOID']),
    ).toEqual({ OPEN: 2, SETTLED: 6, ALL: 8 });
  });

  it('has nothing to say before the server answers', () => {
    expect(segmentCounts(undefined, { ALL: undefined }, ['A'])).toBeUndefined();
  });

  it('reads a status missing from the counts as zero', () => {
    expect(segmentCounts({ A: 1 } as Record<string, number>, { B: ['B'] }, ['A', 'B'])).toEqual({ B: 0 });
  });

  it('matches a short list row on any field, case-insensitively; a blank term matches everything', () => {
    expect(matchesSearch('', ['x'])).toBe(true);
    expect(matchesSearch('  ', [null])).toBe(true);
    expect(matchesSearch('ANN', ['ann@example.com', null])).toBe(true);
    expect(matchesSearch('bob', ['ann@example.com', undefined])).toBe(false);
  });
});
