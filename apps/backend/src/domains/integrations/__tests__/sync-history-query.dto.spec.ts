import { readQueryDto } from '@appshore/kernel/shared/utils/query-dto';
import { fieldErrorsOf } from '@appshore/platform/test/helpers/field-errors.helpers';
import { IntegrationSyncHistoryQueryDto, SyncHistoryQueryDto } from '../dto/sync-history-query.dto';

describe('sync history query DTOs', () => {
  it('pages the unified history with limit and cursor, and reads sync_type and status', async () => {
    // No limit: the service applies the cursor-list default of 50 (this list used to default to 20).
    expect((await readQueryDto(SyncHistoryQueryDto, {})).limit).toBeUndefined();
    expect(
      await readQueryDto(SyncHistoryQueryDto, { limit: '5', cursor: 'abc', sync_type: 'Vendor', status: 'failed' }),
    ).toMatchObject({ limit: 5, cursor: 'abc', syncType: 'Vendor', status: 'failed' });
  });

  it('refuses the old syncType key and an unknown status', async () => {
    expect(await fieldErrorsOf(readQueryDto(SyncHistoryQueryDto, { syncType: 'vendor' }))).toHaveProperty('syncType');
    expect(await fieldErrorsOf(readQueryDto(SyncHistoryQueryDto, { status: 'done' }))).toHaveProperty('status');
  });

  it('answers 400 naming limit when it is not a whole number, and refuses offset paging on both routes', async () => {
    expect(await fieldErrorsOf(readQueryDto(SyncHistoryQueryDto, { limit: 'abc' }))).toHaveProperty('limit');
    expect(await fieldErrorsOf(readQueryDto(SyncHistoryQueryDto, { offset: '10' }))).toHaveProperty('offset');
    expect(await fieldErrorsOf(readQueryDto(IntegrationSyncHistoryQueryDto, { offset: '10' }))).toHaveProperty(
      'offset',
    );
  });

  it('pages one integration with limit (clamped to 100) and cursor', async () => {
    expect(await readQueryDto(IntegrationSyncHistoryQueryDto, { limit: '500', cursor: 'abc' })).toMatchObject({
      limit: 100,
      cursor: 'abc',
    });
  });
});
