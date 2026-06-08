import { useQuery } from '@tanstack/react-query';
import { addOnsApi } from './api';
import { QUERY_TIERS } from '../../shared/config/query-tiers';

export const ADD_ONS_QUERY_KEYS = {
  catalog: ['add-ons', 'catalog'] as const,
  myAddOns: ['add-ons', 'my-add-ons'] as const,
  status: (slug: string) => ['add-ons', 'status', slug] as const,
};

/** Fetch the full catalog of available add-ons */
export function useAddOnCatalog() {
  return useQuery({
    queryKey: ADD_ONS_QUERY_KEYS.catalog,
    queryFn: () => addOnsApi.listCatalog(),
    ...QUERY_TIERS.STATIC,
  });
}

/** Fetch the current tenant's active add-on subscriptions */
export function useMyAddOns() {
  return useQuery({
    queryKey: ADD_ONS_QUERY_KEYS.myAddOns,
    queryFn: () => addOnsApi.listMyAddOns(),
    ...QUERY_TIERS.STATIC,
  });
}

/** Check feature access status for a specific add-on */
export function useAddOnStatus(slug: string) {
  return useQuery({
    queryKey: ADD_ONS_QUERY_KEYS.status(slug),
    queryFn: () => addOnsApi.getStatus(slug),
    enabled: !!slug,
    ...QUERY_TIERS.STATIC,
  });
}
