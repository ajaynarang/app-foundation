import { apiClient } from '../../lib/api-client';
import type { FuelCardType } from '@sally/shared-types';

export type { FuelCardType } from '@sally/shared-types';

export async function getActiveFuelCardTypes(): Promise<FuelCardType[]> {
  return apiClient<FuelCardType[]>('/fuel-cards/types');
}
