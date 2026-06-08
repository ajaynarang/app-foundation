'use client';

import { useQuery } from '@tanstack/react-query';
import { addOnsApi } from './api';
import { queryKeys } from '@/shared/constants';

export const ADD_ONS_QUERY_KEYS = {
  catalog: queryKeys.addOns.catalog,
  myAddOns: queryKeys.addOns.myAddOns,
  status: queryKeys.addOns.status,
};

/** Fetch the full catalog of available add-ons */
export function useAddOnCatalog() {
  return useQuery({
    queryKey: ADD_ONS_QUERY_KEYS.catalog,
    queryFn: () => addOnsApi.listCatalog(),
    staleTime: 5 * 60_000,
  });
}

/** Fetch the current tenant's active add-on subscriptions */
export function useMyAddOns() {
  return useQuery({
    queryKey: ADD_ONS_QUERY_KEYS.myAddOns,
    queryFn: () => addOnsApi.listMyAddOns(),
    staleTime: 5 * 60_000,
  });
}

/** Check feature access status for a specific add-on by slug / feature key */
export function useAddOnStatus(slug: string) {
  return useQuery({
    queryKey: ADD_ONS_QUERY_KEYS.status(slug),
    queryFn: () => addOnsApi.getStatus(slug),
    enabled: !!slug,
    staleTime: 5 * 60_000,
  });
}
