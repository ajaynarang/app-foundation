import { apiClient } from '../../lib/api-client';
import type { AddOn, TenantAddOn, AddOnStatus } from '@app/shared-types';

export type { AddOn, TenantAddOn, AddOnStatus } from '@app/shared-types';

const BASE = '/add-ons';

export const addOnsApi = {
  /** Public catalog of all available add-ons */
  listCatalog(): Promise<AddOn[]> {
    return apiClient<AddOn[]>(BASE);
  },

  /** Authenticated tenant's active add-on subscriptions */
  listMyAddOns(): Promise<TenantAddOn[]> {
    return apiClient<TenantAddOn[]>(`${BASE}/my-add-ons`);
  },

  /** Check access status for a specific add-on by slug */
  getStatus(slug: string): Promise<AddOnStatus> {
    return apiClient<AddOnStatus>(`${BASE}/${slug}/status`);
  },

  /** Request an add-on for the current tenant */
  requestAddOn(slug: string, note?: string): Promise<unknown> {
    return apiClient(`${BASE}/${slug}/request`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    });
  },

  /** Toggle overage for an active add-on */
  toggleOverage(slug: string, enabled: boolean): Promise<unknown> {
    return apiClient(`${BASE}/${slug}/overage`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    });
  },
};
