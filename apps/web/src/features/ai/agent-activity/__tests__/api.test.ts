import { apiClient } from '@appshore/web-core/shared/lib/api';
import { agentActivityApi } from '../api';

jest.mock('@appshore/web-core/shared/lib/api', () => ({ apiClient: jest.fn() }));

describe('agentActivityApi.list', () => {
  beforeEach(() => jest.mocked(apiClient).mockReset());

  it('sends the query keys in snake_case, the way the backend reads them', async () => {
    await agentActivityApi.list({
      principalKind: 'api_key',
      principalId: 'ak1',
      filter: 'all',
      cursor: 'c1',
      limit: 25,
      dateFrom: '2026-04-01',
      dateTo: '2026-04-30',
    });

    const url = jest.mocked(apiClient).mock.calls[0][0] as string;
    const params = new URLSearchParams(url.split('?')[1]);
    expect(url.startsWith('/agent-activity?')).toBe(true);
    expect(Object.fromEntries(params)).toEqual({
      principal_kind: 'api_key',
      principal_id: 'ak1',
      filter: 'all',
      cursor: 'c1',
      limit: '25',
      date_from: '2026-04-01',
      date_to: '2026-04-30',
    });
  });
});
