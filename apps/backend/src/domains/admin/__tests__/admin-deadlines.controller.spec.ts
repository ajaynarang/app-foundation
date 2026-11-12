import { BadRequestException } from '@nestjs/common';
import { UserRole } from '@appshore/db';
import { ROLES_KEY } from '@appshore/platform/auth/decorators/roles.decorator';
import { readQueryDto } from '@appshore/kernel/shared/utils/query-dto';
import { AdminDeadlinesController } from '../admin-deadlines.controller';
import { AdminDeadlineListQueryDto } from '../dto/admin-deadlines-query.dto';

const query = (raw: Record<string, unknown>) => readQueryDto(AdminDeadlineListQueryDto, raw);

const DEADLINE_HEALTH = { pending: 3, failing: 1, overdue: 0, oldestOverdueDueAt: null };

describe('AdminDeadlinesController', () => {
  const deadlines = {
    list: jest.fn().mockResolvedValue({ items: [], nextCursor: null, total: 0, counts: {} }),
    health: jest.fn().mockResolvedValue(DEADLINE_HEALTH),
    kinds: jest.fn().mockResolvedValue(['APPROVAL_REMIND']),
  };

  beforeEach(() => jest.clearAllMocks());

  it('is super-admin only', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AdminDeadlinesController)).toEqual([UserRole.SUPER_ADMIN]);
  });

  it('parses the list params', async () => {
    const controller = new AdminDeadlinesController(deadlines as never);

    await controller.list(
      await query({
        limit: '20',
        cursor: 'cur',
        state: 'PENDING,FAILING',
        kind: ' APPROVAL_REMIND ',
        tenant: 'acme',
        sort: 'latest',
      }),
    );

    expect(deadlines.list).toHaveBeenCalledWith({
      limit: 20,
      cursor: 'cur',
      states: ['PENDING', 'FAILING'],
      kind: 'APPROVAL_REMIND',
      tenant: 'acme',
      sort: 'latest',
    });
  });

  it('defaults to every state, soonest first', async () => {
    const controller = new AdminDeadlinesController(deadlines as never);

    await controller.list(await query({}));

    expect(deadlines.list).toHaveBeenCalledWith({
      limit: undefined,
      cursor: undefined,
      states: undefined,
      kind: undefined,
      tenant: undefined,
      sort: 'soonest',
    });
  });

  it.each([
    ['an unknown state', { limit: '1', state: 'LATE' }],
    ['an unknown sort', { sort: 'oldest' }],
    ['a repeated cursor', { cursor: ['a', 'b'] }],
    ['a non-numeric limit', { limit: 'abc' }],
    ['a kind with a control character', { kind: 'APPROVAL\u0000' }],
    ['an over-long tenant', { tenant: 't'.repeat(101) }],
  ])('answers %s with a 400', async (_label, raw) => {
    const controller = new AdminDeadlinesController(deadlines as never);

    await expect((async () => controller.list(await query(raw)))()).rejects.toBeInstanceOf(BadRequestException);
  });

  it('treats a blank filter as no filter', async () => {
    const controller = new AdminDeadlinesController(deadlines as never);

    await controller.list(await query({ kind: '   ', tenant: '' }));

    expect(deadlines.list).toHaveBeenCalledWith(expect.objectContaining({ kind: undefined, tenant: undefined }));
  });

  it('lists the kinds on record', async () => {
    const controller = new AdminDeadlinesController(deadlines as never);

    await expect(controller.kinds()).resolves.toEqual(['APPROVAL_REMIND']);
  });

  it('reports deadline health with no outbox until one is bound', async () => {
    const controller = new AdminDeadlinesController(deadlines as never);

    await expect(controller.health()).resolves.toEqual({ deadlines: DEADLINE_HEALTH, outbox: null });
  });

  it('includes the outbox health when a reader is bound', async () => {
    const outbox = { health: jest.fn().mockResolvedValue({ unpublished: 2, oldestAgeSeconds: 14 }) };
    const controller = new AdminDeadlinesController(deadlines as never, outbox);

    await expect(controller.health()).resolves.toEqual({
      deadlines: DEADLINE_HEALTH,
      outbox: { unpublished: 2, oldestAgeSeconds: 14 },
    });
  });
});
