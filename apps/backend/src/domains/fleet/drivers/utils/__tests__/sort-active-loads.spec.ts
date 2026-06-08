import { sortActiveLoads } from '../sort-active-loads';

describe('sortActiveLoads', () => {
  // ── in_transit priority ──

  it('puts in_transit loads first', () => {
    const loads = [
      { status: 'ASSIGNED', pickupDate: '2026-04-10' },
      { status: 'IN_TRANSIT', pickupDate: '2026-04-12' },
      { status: 'PENDING', pickupDate: '2026-04-09' },
    ];

    const sorted = sortActiveLoads(loads);

    expect(sorted[0].status).toBe('IN_TRANSIT');
  });

  it('keeps order when both are in_transit (sorts by pickupDate)', () => {
    const loads = [
      { status: 'IN_TRANSIT', pickupDate: '2026-04-12' },
      { status: 'IN_TRANSIT', pickupDate: '2026-04-10' },
    ];

    const sorted = sortActiveLoads(loads);

    expect(sorted[0].pickupDate).toBe('2026-04-10');
    expect(sorted[1].pickupDate).toBe('2026-04-12');
  });

  // ── pickupDate sorting ──

  it('sorts non-in_transit loads by pickupDate ascending', () => {
    const loads = [
      { status: 'ASSIGNED', pickupDate: '2026-04-15' },
      { status: 'ASSIGNED', pickupDate: '2026-04-10' },
      { status: 'PENDING', pickupDate: '2026-04-12' },
    ];

    const sorted = sortActiveLoads(loads);

    expect(sorted.map((l) => l.pickupDate)).toEqual(['2026-04-10', '2026-04-12', '2026-04-15']);
  });

  it('handles null/undefined pickupDate by treating as Infinity', () => {
    const loads = [
      { status: 'ASSIGNED', pickupDate: undefined },
      { status: 'ASSIGNED', pickupDate: '2026-04-10' },
    ];

    const sorted = sortActiveLoads(loads);

    expect(sorted[0].pickupDate).toBe('2026-04-10');
    expect(sorted[1].pickupDate).toBeUndefined();
  });

  // ── assignedAt tiebreaker ──

  it('uses assignedAt as tiebreaker when pickupDate is the same', () => {
    const loads = [
      {
        status: 'ASSIGNED',
        pickupDate: '2026-04-10',
        assignedAt: '2026-04-09T14:00:00Z',
      },
      {
        status: 'ASSIGNED',
        pickupDate: '2026-04-10',
        assignedAt: '2026-04-09T10:00:00Z',
      },
    ];

    const sorted = sortActiveLoads(loads);

    // Earlier assignedAt first
    expect(sorted[0].assignedAt).toBe('2026-04-09T10:00:00Z');
    expect(sorted[1].assignedAt).toBe('2026-04-09T14:00:00Z');
  });

  it('falls back to createdAt when assignedAt is undefined', () => {
    const loads = [
      {
        status: 'ASSIGNED',
        pickupDate: '2026-04-10',
        assignedAt: undefined,
        createdAt: '2026-04-08T10:00:00Z',
      },
      {
        status: 'ASSIGNED',
        pickupDate: '2026-04-10',
        assignedAt: undefined,
        createdAt: '2026-04-07T10:00:00Z',
      },
    ];

    const sorted = sortActiveLoads(loads);

    expect(sorted[0].createdAt).toBe('2026-04-07T10:00:00Z');
    expect(sorted[1].createdAt).toBe('2026-04-08T10:00:00Z');
  });

  it('treats missing assignedAt and createdAt as Infinity', () => {
    const loads = [
      { status: 'ASSIGNED', pickupDate: '2026-04-10' },
      {
        status: 'ASSIGNED',
        pickupDate: '2026-04-10',
        assignedAt: '2026-04-09T10:00:00Z',
      },
    ];

    const sorted = sortActiveLoads(loads);

    // The one with assignedAt should come first
    expect(sorted[0].assignedAt).toBe('2026-04-09T10:00:00Z');
    expect(sorted[1].assignedAt).toBeUndefined();
  });

  // ── edge cases ──

  it('returns empty array for empty input', () => {
    expect(sortActiveLoads([])).toEqual([]);
  });

  it('returns single element unchanged', () => {
    const loads = [{ status: 'ASSIGNED', pickupDate: '2026-04-10' }];
    const sorted = sortActiveLoads(loads);
    expect(sorted).toEqual(loads);
  });

  it('does not mutate the original array', () => {
    const loads = [
      { status: 'PENDING', pickupDate: '2026-04-15' },
      { status: 'IN_TRANSIT', pickupDate: '2026-04-10' },
    ];
    const original = [...loads];
    sortActiveLoads(loads);
    expect(loads).toEqual(original);
  });

  it('handles complex mix of statuses and dates', () => {
    const loads = [
      { status: 'PENDING', pickupDate: '2026-04-11', assignedAt: undefined },
      { status: 'IN_TRANSIT', pickupDate: '2026-04-20' },
      {
        status: 'ASSIGNED',
        pickupDate: '2026-04-10',
        assignedAt: '2026-04-09T12:00:00Z',
      },
      { status: 'IN_TRANSIT', pickupDate: '2026-04-08' },
      {
        status: 'ASSIGNED',
        pickupDate: '2026-04-10',
        assignedAt: '2026-04-09T08:00:00Z',
      },
    ];

    const sorted = sortActiveLoads(loads);

    // in_transit loads first, sorted by pickupDate
    expect(sorted[0].status).toBe('IN_TRANSIT');
    expect(sorted[0].pickupDate).toBe('2026-04-08');
    expect(sorted[1].status).toBe('IN_TRANSIT');
    expect(sorted[1].pickupDate).toBe('2026-04-20');

    // Then assigned/pending by pickupDate, then assignedAt tiebreaker
    expect(sorted[2].pickupDate).toBe('2026-04-10');
    expect(sorted[2].assignedAt).toBe('2026-04-09T08:00:00Z');
    expect(sorted[3].pickupDate).toBe('2026-04-10');
    expect(sorted[3].assignedAt).toBe('2026-04-09T12:00:00Z');
    expect(sorted[4].pickupDate).toBe('2026-04-11');
  });
});
