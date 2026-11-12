import { PrismaOutboxHealthReader } from '../outbox-health.reader';

describe('PrismaOutboxHealthReader', () => {
  const aggregate = jest.fn();
  const reader = new PrismaOutboxHealthReader({ outboxEvent: { aggregate } } as never);
  const now = new Date('2026-10-09T12:00:00.000Z');

  beforeEach(() => aggregate.mockReset());

  it('counts unpublished events and ages the oldest in whole seconds', async () => {
    aggregate.mockResolvedValue({ _count: { _all: 3 }, _min: { occurredAt: new Date('2026-10-09T11:59:15.400Z') } });

    await expect(reader.health(now)).resolves.toEqual({ unpublished: 3, oldestAgeSeconds: 45 });
    expect(aggregate).toHaveBeenCalledWith({
      where: { publishedAt: null },
      _count: { _all: true },
      _min: { occurredAt: true },
    });
  });

  it('reports no age when nothing is waiting', async () => {
    aggregate.mockResolvedValue({ _count: { _all: 0 }, _min: { occurredAt: null } });

    await expect(reader.health(now)).resolves.toEqual({ unpublished: 0, oldestAgeSeconds: null });
  });

  it('never reports a negative age for a row stamped a moment ahead of this clock', async () => {
    aggregate.mockResolvedValue({ _count: { _all: 1 }, _min: { occurredAt: new Date('2026-10-09T12:00:02.000Z') } });

    await expect(reader.health(now)).resolves.toEqual({ unpublished: 1, oldestAgeSeconds: 0 });
  });
});
