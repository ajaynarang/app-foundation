import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { FeedbackStatusEnum } from '@app/shared-types';
import { ListFeedbackQueryDto } from '../dto/list-feedback-query.dto';

describe('ListFeedbackQueryDto', () => {
  async function build(input: Partial<Record<string, unknown>>) {
    return plainToInstance(ListFeedbackQueryDto, input, {
      enableImplicitConversion: true,
    });
  }

  it('accepts an empty query', async () => {
    const dto = await build({});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it.each(FeedbackStatusEnum.options)('accepts canonical uppercase status %s', async (status) => {
    const dto = await build({ status });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects a lowercase status (the casing bug)', async () => {
    const dto = await build({ status: 'new' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects an unknown status', async () => {
    const dto = await build({ status: 'BOGUS' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it.each(['bug', 'idea', 'general', 'uncategorized'])('accepts lowercase category %s', async (category) => {
    const dto = await build({ category });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects an unknown category', async () => {
    const dto = await build({ category: 'BUG' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
