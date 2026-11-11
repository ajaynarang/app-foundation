import { apiClient } from '@appshore/web-core/shared/lib/api';
import { getWebhookLogs } from '../api';

jest.mock('@appshore/web-core/shared/lib/api', () => ({ apiClient: jest.fn() }));

describe('getWebhookLogs', () => {
  beforeEach(() => jest.mocked(apiClient).mockReset());

  it('sends the date range as date_from and date_to', async () => {
    await getWebhookLogs('sub-1', { limit: 10, offset: 20, dateFrom: '2026-04-01', dateTo: '2026-04-30' });

    const url = jest.mocked(apiClient).mock.calls[0][0] as string;
    expect(url.startsWith('/webhooks/sub-1/logs?')).toBe(true);
    expect(Object.fromEntries(new URLSearchParams(url.split('?')[1]))).toEqual({
      limit: '10',
      offset: '20',
      date_from: '2026-04-01',
      date_to: '2026-04-30',
    });
  });
});
