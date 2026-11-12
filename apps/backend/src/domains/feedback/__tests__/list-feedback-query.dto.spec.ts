import { FeedbackStatusEnum } from '@app/shared-types';
import { readQueryDto } from '@appshore/kernel/shared/utils/query-dto';
import { fieldErrorsOf } from '@appshore/platform/test/helpers/field-errors.helpers';
import { ListFeedbackQueryDto } from '../dto/list-feedback-query.dto';

describe('ListFeedbackQueryDto', () => {
  const read = (raw: Record<string, unknown>) => readQueryDto(ListFeedbackQueryDto, raw);

  it('accepts an empty query', async () => {
    await expect(read({})).resolves.toBeInstanceOf(ListFeedbackQueryDto);
  });

  it.each(FeedbackStatusEnum.options)('accepts canonical uppercase status %s', async (status) => {
    expect((await read({ status })).status).toBe(status);
  });

  it('rejects a lowercase status (the casing bug)', async () => {
    expect(await fieldErrorsOf(read({ status: 'new' }))).toHaveProperty('status');
  });

  it('rejects an unknown status', async () => {
    expect(await fieldErrorsOf(read({ status: 'BOGUS' }))).toHaveProperty('status');
  });

  it.each(['bug', 'idea', 'general', 'uncategorized'])('accepts lowercase category %s', async (category) => {
    expect((await read({ category })).category).toBe(category);
  });

  it('rejects an unknown category', async () => {
    expect(await fieldErrorsOf(read({ category: 'BUG' }))).toHaveProperty('category');
  });

  it('reads the snake_case keys into camelCase properties as numbers', async () => {
    expect(
      await read({
        tenant_id: '7',
        sentiment_min: '2',
        sentiment_max: '5',
        cursor: 'abc',
        limit: '500',
        from: '2026-04-01',
      }),
    ).toMatchObject({ tenantId: 7, sentimentMin: 2, sentimentMax: 5, cursor: 'abc', limit: 100, from: '2026-04-01' });
  });

  it('refuses page paging: the list is a cursor list', async () => {
    expect(await fieldErrorsOf(read({ page: '2' }))).toHaveProperty('page');
  });

  it('refuses the camelCase keys the route used to read', async () => {
    expect(await fieldErrorsOf(read({ tenantId: '7' }))).toHaveProperty('tenantId');
    expect(await fieldErrorsOf(read({ sentimentMin: '2' }))).toHaveProperty('sentimentMin');
    expect(await fieldErrorsOf(read({ sentimentMax: '5' }))).toHaveProperty('sentimentMax');
  });

  it('answers 400 naming a sentiment out of 1…5, a number that is not one, or a date that is not one', async () => {
    expect(await fieldErrorsOf(read({ sentiment_min: '0' }))).toHaveProperty('sentiment_min');
    expect(await fieldErrorsOf(read({ sentiment_max: '6' }))).toHaveProperty('sentiment_max');
    expect(await fieldErrorsOf(read({ tenant_id: 'abc' }))).toHaveProperty('tenant_id');
    expect(await fieldErrorsOf(read({ to: 'later' }))).toHaveProperty('to');
  });
});
