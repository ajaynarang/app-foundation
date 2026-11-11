import { apiClient } from '@appshore/web-core/shared/lib/api';
import { getWebhookLogs, listWebhooks } from '../api';

jest.mock('@appshore/web-core/shared/lib/api', () => ({ apiClient: jest.fn() }));

describe('getWebhookLogs', () => {
  beforeEach(() => jest.mocked(apiClient).mockReset());

  it('sends the date range as date_from and date_to, and pages with a cursor', async () => {
    await getWebhookLogs('sub-1', { limit: 10, cursor: 'abc', dateFrom: '2026-04-01', dateTo: '2026-04-30' });

    const url = jest.mocked(apiClient).mock.calls[0][0] as string;
    expect(url.startsWith('/webhooks/sub-1/logs?')).toBe(true);
    expect(Object.fromEntries(new URLSearchParams(url.split('?')[1]))).toEqual({
      limit: '10',
      cursor: 'abc',
      date_from: '2026-04-01',
      date_to: '2026-04-30',
    });
  });

  it('never sends offset: the first page has no cursor at all', async () => {
    await getWebhookLogs('sub-1');
    await listWebhooks();
    await listWebhooks({ cursor: 'next' });

    const urls = jest.mocked(apiClient).mock.calls.map((call) => call[0] as string);
    expect(urls).toEqual(['/webhooks/sub-1/logs?limit=20', '/webhooks', '/webhooks?cursor=next']);
  });
});
