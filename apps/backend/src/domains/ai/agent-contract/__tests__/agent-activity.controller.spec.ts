import { readQueryDto } from '@appshore/kernel/shared/utils/query-dto';
import { fieldErrorsOf } from '@appshore/platform/test/helpers/field-errors.helpers';
import { AgentActivityController } from '../agent-activity.controller';
import { AgentActivityQueryDto } from '../dto/agent-activity-query.dto';

describe('AgentActivityController', () => {
  let controller: AgentActivityController;
  let service: any;
  let prisma: any;

  const user = { tenantId: 'tenant-7' };

  beforeEach(() => {
    service = {
      list: jest.fn().mockResolvedValue({ rows: [], nextCursor: null }),
    };
    prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ id: 7, tenantId: 'tenant-7' }),
      },
    };
    controller = new AgentActivityController(prisma, service);
  });

  const query = (raw: Record<string, unknown>) => readQueryDto(AgentActivityQueryDto, raw);

  it('answers 400 naming principal_kind when it is unknown or missing', async () => {
    expect(await fieldErrorsOf(query({ principal_kind: 'bogus', principal_id: 'x1' }))).toHaveProperty(
      'principal_kind',
    );
    expect(await fieldErrorsOf(query({ principal_id: 'x1' }))).toHaveProperty('principal_kind');
  });

  it('answers 400 naming principal_id when it is empty', async () => {
    expect(await fieldErrorsOf(query({ principal_kind: 'api_key', principal_id: '' }))).toHaveProperty('principal_id');
  });

  it('answers 400 naming filter when it is unknown', async () => {
    expect(
      await fieldErrorsOf(query({ principal_kind: 'api_key', principal_id: 'ak1', filter: 'bogus' })),
    ).toHaveProperty('filter');
  });

  it('answers 400 naming a date that is not YYYY-MM-DD, or a limit that is not a number', async () => {
    const base = { principal_kind: 'api_key', principal_id: 'ak1' };
    expect(await fieldErrorsOf(query({ ...base, date_from: '01/02/2026' }))).toHaveProperty('date_from');
    expect(await fieldErrorsOf(query({ ...base, date_to: '2026-1-2' }))).toHaveProperty('date_to');
    expect(await fieldErrorsOf(query({ ...base, limit: 'abc' }))).toHaveProperty('limit');
  });

  it('refuses the camelCase keys the route used to read', async () => {
    expect(await fieldErrorsOf(query({ principalKind: 'api_key', principalId: 'ak1' }))).toHaveProperty(
      'principalKind',
    );
  });

  it('delegates to service with tenantId resolved from user', async () => {
    await controller.list(user, await query({ principal_kind: 'api_key', principal_id: 'ak1' }));
    expect(service.list).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 7,
        principalKind: 'api_key',
        principalId: 'ak1',
        filter: 'all',
        cursor: null,
        limit: 50,
        dateFrom: null,
        dateTo: null,
      }),
    );
  });

  it('passes cursor, limit and dates to service when provided', async () => {
    await controller.list(
      user,
      await query({
        principal_kind: 'oauth_client',
        principal_id: 'c1',
        filter: 'approvals',
        cursor: '2026-01-01T00:00:00.000Z',
        limit: '25',
        date_from: '2026-01-01',
        date_to: '2026-01-31',
      }),
    );
    expect(service.list).toHaveBeenCalledWith(
      expect.objectContaining({
        principalKind: 'oauth_client',
        filter: 'approvals',
        cursor: '2026-01-01T00:00:00.000Z',
        limit: 25,
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
      }),
    );
  });
});
