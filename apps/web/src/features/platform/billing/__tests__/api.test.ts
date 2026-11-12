import { apiClient } from '@appshore/web-core/shared/lib/api';
import { billingApi } from '../api';

jest.mock('@appshore/web-core/shared/lib/api', () => ({ apiClient: jest.fn() }));

const request = jest.mocked(apiClient);

describe('billingApi.getTenants', () => {
  beforeEach(() => request.mockReset());

  it('follows nextCursor page by page until the list ends, and returns every tenant', async () => {
    request
      .mockResolvedValueOnce({ items: [{ tenantId: 'a' }, { tenantId: 'b' }], nextCursor: 'c1', total: 3 })
      .mockResolvedValueOnce({ items: [{ tenantId: 'c' }], nextCursor: null, total: 3 });

    const tenants = await billingApi.getTenants<{ tenantId: string }>();

    expect(tenants.map((tenant) => tenant.tenantId)).toEqual(['a', 'b', 'c']);
    expect(request.mock.calls.map((call) => call[0])).toEqual(['/tenants?limit=100', '/tenants?limit=100&cursor=c1']);
  });

  it('stops after a fixed number of pages instead of looping on a list that never ends', async () => {
    request.mockResolvedValue({ items: [{ tenantId: 'x' }], nextCursor: 'again', total: 999999 });

    const tenants = await billingApi.getTenants();

    expect(request).toHaveBeenCalledTimes(50);
    expect(tenants).toHaveLength(50);
  });
});
