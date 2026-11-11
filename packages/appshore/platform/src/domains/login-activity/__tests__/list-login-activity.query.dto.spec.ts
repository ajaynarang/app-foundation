import { readQueryDto } from '@appshore/kernel/shared/utils/query-dto';
import { fieldErrorsOf } from '../../../test/helpers/field-errors.helpers';
import { LoginActivitySummaryQueryDto } from '../dto/login-activity-summary.query.dto';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ListLoginActivityQueryDto } from '../dto/list-login-activity.query.dto';
import { LOGIN_ACTIVITY } from '../constants';

describe('ListLoginActivityQueryDto', () => {
  async function build(input: Partial<Record<string, unknown>>) {
    return plainToInstance(ListLoginActivityQueryDto, input, {
      enableImplicitConversion: true,
    });
  }

  it('accepts a minimal valid query', async () => {
    const dto = await build({ from: '2026-05-19', to: '2026-05-26' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects a range > 90 days', async () => {
    const dto = await build({ from: '2026-01-01', to: '2026-05-01' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
    expect(messages.some((m) => m.includes(`${LOGIN_ACTIVITY.MAX_RANGE_DAYS}`))).toBe(true);
  });

  it('rejects to < from', async () => {
    const dto = await build({ from: '2026-05-26', to: '2026-05-19' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects limit > 100', async () => {
    const dto = await build({
      from: '2026-05-19',
      to: '2026-05-26',
      limit: 200,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts valid statuses array', async () => {
    const dto = await build({
      from: '2026-05-19',
      to: '2026-05-26',
      statuses: ['SUCCESS', 'FAILED'],
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects an unknown status', async () => {
    const dto = await build({
      from: '2026-05-19',
      to: '2026-05-26',
      statuses: ['BOGUS'],
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a non-date from', async () => {
    const dto = await build({ from: 'not-a-date', to: '2026-05-26' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('coerces a single status string into an array', async () => {
    const dto = await build({ from: '2026-05-19', to: '2026-05-26', statuses: 'SUCCESS' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.statuses).toEqual(['SUCCESS']);
  });

  it('coerces a single role string into an array', async () => {
    const dto = await build({ from: '2026-05-19', to: '2026-05-26', roles: 'ADMIN' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.roles).toEqual(['ADMIN']);
  });

  describe('wire names (through the global pipe)', () => {
    const range = { from: '2026-05-19', to: '2026-05-26' };

    it('reads tenant_id, user_query and exclude_super_admin into camelCase properties', async () => {
      const dto = await readQueryDto(ListLoginActivityQueryDto, {
        ...range,
        tenant_id: '42',
        user_query: ' ada ',
        exclude_super_admin: 'true',
        limit: '25',
      });
      expect(dto).toMatchObject({ tenantId: 42, userQuery: 'ada', excludeSuperAdmin: true, limit: 25 });
    });

    it('refuses the camelCase keys the routes used to read', async () => {
      for (const key of ['tenantId', 'userQuery', 'excludeSuperAdmin']) {
        expect(await fieldErrorsOf(readQueryDto(ListLoginActivityQueryDto, { ...range, [key]: '1' }))).toHaveProperty(
          key,
        );
      }
      for (const key of ['tenantId', 'excludeSuperAdmin']) {
        expect(
          await fieldErrorsOf(readQueryDto(LoginActivitySummaryQueryDto, { ...range, [key]: '1' })),
        ).toHaveProperty(key);
      }
    });

    it('answers 400 naming a tenant_id that is not a number, or a flag that is not true or false', async () => {
      expect(
        await fieldErrorsOf(readQueryDto(ListLoginActivityQueryDto, { ...range, tenant_id: 'abc' })),
      ).toHaveProperty('tenant_id');
      expect(
        await fieldErrorsOf(readQueryDto(LoginActivitySummaryQueryDto, { ...range, exclude_super_admin: 'yes' })),
      ).toHaveProperty('exclude_super_admin');
    });

    it('the summary reads the same two keys', async () => {
      expect(
        await readQueryDto(LoginActivitySummaryQueryDto, { ...range, tenant_id: '7', exclude_super_admin: 'false' }),
      ).toMatchObject({ tenantId: 7, excludeSuperAdmin: false });
    });
  });
});
