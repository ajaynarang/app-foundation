import { readQueryDto } from '@appshore/kernel/shared/utils/query-dto';
import { fieldErrorsOf } from '@appshore/platform/test/helpers/field-errors.helpers';
import { IntegrationSyncHistoryQueryDto, SyncHistoryQueryDto } from '../dto/sync-history-query.dto';

describe('sync history query DTOs', () => {
  it('pages the unified history with limit (default 20) and offset, and reads sync_type and status', async () => {
    expect(await readQueryDto(SyncHistoryQueryDto, {})).toMatchObject({ limit: 20, offset: 0 });
    expect(
      await readQueryDto(SyncHistoryQueryDto, { limit: '5', offset: '10', sync_type: 'Vendor', status: 'failed' }),
    ).toMatchObject({ limit: 5, offset: 10, syncType: 'Vendor', status: 'failed' });
  });

  it('refuses the old syncType key and an unknown status', async () => {
    expect(await fieldErrorsOf(readQueryDto(SyncHistoryQueryDto, { syncType: 'vendor' }))).toHaveProperty('syncType');
    expect(await fieldErrorsOf(readQueryDto(SyncHistoryQueryDto, { status: 'done' }))).toHaveProperty('status');
  });

  it('answers 400 naming limit or offset when it is not a whole number', async () => {
    expect(await fieldErrorsOf(readQueryDto(SyncHistoryQueryDto, { limit: 'abc' }))).toHaveProperty('limit');
    expect(await fieldErrorsOf(readQueryDto(IntegrationSyncHistoryQueryDto, { offset: '1.5' }))).toHaveProperty(
      'offset',
    );
  });

  it('pages one integration with limit (default 50) and offset', async () => {
    expect(await readQueryDto(IntegrationSyncHistoryQueryDto, {})).toMatchObject({ limit: 50, offset: 0 });
  });
});
