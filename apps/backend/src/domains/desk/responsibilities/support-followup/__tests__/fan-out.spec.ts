import { findQuietTicketsForTenant, wholeDaysBetween } from '../fan-out';

const NOW = new Date('2026-11-16T12:00:00Z');

describe('support follow-up: fan-out', () => {
  const findMany = jest.fn();
  const prisma = { supportTicket: { findMany } } as never;

  beforeEach(() => findMany.mockReset());

  it('asks only for this tenant’s open tickets with no visible reply since the cutoff', async () => {
    findMany.mockResolvedValue([]);
    await findQuietTicketsForTenant(prisma, 7, { staleAfterDays: 3, now: NOW });

    const cutoff = new Date('2026-11-13T12:00:00Z');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 7,
          status: { in: ['OPEN', 'IN_PROGRESS'] },
          createdAt: { lte: cutoff },
          messages: { none: { isInternal: false, createdAt: { gt: cutoff } } },
        },
        take: 100,
      }),
    );
  });

  it('counts quiet days from the last visible reply, or from the opening when there is none', async () => {
    findMany.mockResolvedValue([
      {
        ticketNumber: 'ST-1',
        subject: 'A',
        priority: 'LOW',
        createdAt: new Date('2026-11-01T12:00:00Z'),
        messages: [{ createdAt: new Date('2026-11-10T12:00:00Z') }],
      },
      {
        ticketNumber: 'ST-2',
        subject: 'B',
        priority: 'HIGH',
        createdAt: new Date('2026-11-06T13:00:00Z'),
        messages: [],
      },
    ]);

    await expect(findQuietTicketsForTenant(prisma, 7, { staleAfterDays: 3, now: NOW })).resolves.toEqual([
      { ticketNumber: 'ST-1', subject: 'A', priority: 'LOW', daysQuiet: 6 },
      { ticketNumber: 'ST-2', subject: 'B', priority: 'HIGH', daysQuiet: 9 },
    ]);
  });

  it('honours a caller’s limit', async () => {
    findMany.mockResolvedValue([]);
    await findQuietTicketsForTenant(prisma, 7, { staleAfterDays: 1, limit: 5, now: NOW });
    expect(findMany.mock.calls[0][0].take).toBe(5);
  });

  it('counts whole days only', () => {
    expect(wholeDaysBetween(new Date('2026-11-15T12:00:01Z'), NOW)).toBe(0);
    expect(wholeDaysBetween(new Date('2026-11-15T12:00:00Z'), NOW)).toBe(1);
  });
});
