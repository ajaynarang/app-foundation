import { apiClient } from '@/shared/lib/api';
import type { FuelCardType, BrandAcceptance } from '@sally/shared-types';

export type { FuelCardType, BrandAcceptance } from '@sally/shared-types';

// ── Super Admin ──

export async function getAllFuelCardTypes(): Promise<FuelCardType[]> {
  return apiClient<FuelCardType[]>('/fuel-cards/admin/types');
}

export async function updateFuelCardType(
  id: string,
  data: { displayName?: string; description?: string; isActive?: boolean },
): Promise<FuelCardType> {
  return apiClient<FuelCardType>(`/fuel-cards/admin/types/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function getBrandAcceptanceMap(): Promise<BrandAcceptance[]> {
  return apiClient<BrandAcceptance[]>('/fuel-cards/admin/brand-acceptance');
}

export async function setBrandAcceptance(brand: string, fuelCardTypeIds: string[]): Promise<BrandAcceptance> {
  return apiClient<BrandAcceptance>('/fuel-cards/admin/brand-acceptance', {
    method: 'POST',
    body: JSON.stringify({ brand, fuelCardTypeIds }),
  });
}

export async function deleteBrand(brand: string): Promise<void> {
  await apiClient(`/fuel-cards/admin/brand-acceptance/${encodeURIComponent(brand)}`, {
    method: 'DELETE',
  });
}
