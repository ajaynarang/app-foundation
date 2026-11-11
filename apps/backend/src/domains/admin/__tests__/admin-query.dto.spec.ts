import { readQueryDto } from '@appshore/kernel/shared/utils/query-dto';
import { fieldErrorsOf } from '@appshore/platform/test/helpers/field-errors.helpers';
import { AdminEventListQueryDto } from '../dto/admin-events-query.dto';
import {
  AiSpendInvocationListQueryDto,
  AiSpendQuotaWindowQueryDto,
  AiSpendWindowQueryDto,
} from '../dto/ai-spend-query.dto';

describe('admin query DTOs', () => {
  describe('GET /admin/events', () => {
    it('reads q, tenant, actor_type, since, until and pages with limit and offset', async () => {
      const query = await readQueryDto(AdminEventListQueryDto, {
        q: ' invoice ',
        tenant: 'demo-acme',
        actor_type: 'user',
        since: '2026-04-01',
        until: '2026-04-30T12:00:00Z',
        limit: '500',
        offset: '20',
      });
      expect(query).toMatchObject({
        q: 'invoice',
        tenantId: 'demo-acme',
        actorType: 'user',
        since: '2026-04-01',
        until: '2026-04-30T12:00:00Z',
        limit: 100,
        offset: 20,
      });
    });

    it('defaults to the first 50', async () => {
      expect(await readQueryDto(AdminEventListQueryDto, {})).toMatchObject({ limit: 50, offset: 0 });
    });

    it('refuses the old keys: search and actorType', async () => {
      expect(await fieldErrorsOf(readQueryDto(AdminEventListQueryDto, { search: 'x' }))).toHaveProperty('search');
      expect(await fieldErrorsOf(readQueryDto(AdminEventListQueryDto, { actorType: 'user' }))).toHaveProperty(
        'actorType',
      );
    });

    it('answers 400 naming a bad number or date', async () => {
      expect(await fieldErrorsOf(readQueryDto(AdminEventListQueryDto, { limit: 'abc' }))).toHaveProperty('limit');
      expect(await fieldErrorsOf(readQueryDto(AdminEventListQueryDto, { offset: '-5' }))).toHaveProperty('offset');
      expect(await fieldErrorsOf(readQueryDto(AdminEventListQueryDto, { since: 'soon' }))).toHaveProperty('since');
    });
  });

  describe('AI spend', () => {
    it('clamps days to 1…90 and defaults per route', async () => {
      expect((await readQueryDto(AiSpendWindowQueryDto, {})).days).toBe(7);
      expect((await readQueryDto(AiSpendQuotaWindowQueryDto, {})).days).toBe(30);
      expect((await readQueryDto(AiSpendWindowQueryDto, { days: '365' })).days).toBe(90);
      expect((await readQueryDto(AiSpendWindowQueryDto, { days: '0' })).days).toBe(1);
    });

    it('answers 400 naming days when it is not a number', async () => {
      expect(await fieldErrorsOf(readQueryDto(AiSpendWindowQueryDto, { days: 'abc' }))).toHaveProperty('days');
    });

    it('reads the invocation list filters and refuses an unknown surface', async () => {
      expect(
        await readQueryDto(AiSpendInvocationListQueryDto, { surface: 'CHAT', limit: '10', cursor: 'abc' }),
      ).toMatchObject({ surface: 'CHAT', limit: 10, cursor: 'abc' });
      expect(await fieldErrorsOf(readQueryDto(AiSpendInvocationListQueryDto, { surface: 'nope' }))).toHaveProperty(
        'surface',
      );
    });
  });
});
