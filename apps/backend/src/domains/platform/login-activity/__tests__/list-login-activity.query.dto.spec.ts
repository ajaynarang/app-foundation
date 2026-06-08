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
});
