import { apiClient } from '@appshore/web-core/shared/lib/api';
import type { CursorList } from '@app/shared-types';

/** The billing aggregates read at most this many pages of tenants (100 a page). */
const MAX_TENANT_PAGES = 50;

export const billingApi = {
  /**
   * Every tenant, for the billing aggregates. `GET /tenants` is a cursor list, so this follows `nextCursor`
   * page by page (100 a page) until the list ends, and stops at MAX_TENANT_PAGES rather than loop forever.
   */
  getTenants: async <T = unknown>(): Promise<T[]> => {
    const tenants: T[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_TENANT_PAGES; page++) {
      const search = new URLSearchParams({ limit: '100' });
      if (cursor) search.set('cursor', cursor);
      const result = await apiClient<CursorList<T>>(`/tenants?${search.toString()}`);
      tenants.push(...result.items);
      if (!result.nextCursor) break;
      cursor = result.nextCursor;
    }
    return tenants;
  },

  /**
   * Fetch all plan configurations with pricing info.
   */
  getPlans: async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await apiClient<any>('/plans');
    return data.plans || data || [];
  },
};
