import { apiClient } from '@/shared/lib/api';
import type { Driver, CreateDriverRequest, UpdateDriverRequest, DriverHOS, ActivateAndInviteResponse } from './types';

export const driversApi = {
  list: async (includeInactive?: boolean): Promise<Driver[]> => {
    const params = includeInactive ? '?includeInactive=true' : '';
    return apiClient<Driver[]>(`/drivers${params}`);
  },

  getById: async (driverId: string): Promise<Driver> => {
    return apiClient<Driver>(`/drivers/${driverId}`);
  },

  create: async (data: CreateDriverRequest): Promise<Driver> => {
    return apiClient<Driver>('/drivers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (driverId: string, data: UpdateDriverRequest): Promise<Driver> => {
    return apiClient<Driver>(`/drivers/${driverId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /**
   * Fetch live HOS data for a driver from external integration
   */
  getHOS: async (driverId: string): Promise<DriverHOS> => {
    return apiClient<DriverHOS>(`/drivers/${driverId}/hos`);
  },

  /**
   * Activate a driver AND send SALLY invitation in one step
   */
  activateAndInvite: async (driverId: string, email?: string, phone?: string): Promise<ActivateAndInviteResponse> => {
    return apiClient<ActivateAndInviteResponse>(`/drivers/${driverId}/activate-and-invite`, {
      method: 'POST',
      body: JSON.stringify({ email, phone }),
    });
  },

  /**
   * Get pending activation drivers
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getPending: async (): Promise<any[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return apiClient<any[]>('/drivers/pending/list');
  },

  /**
   * Get inactive drivers
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getInactive: async (): Promise<any[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return apiClient<any[]>('/drivers/inactive/list');
  },

  /**
   * Activate a pending driver (fleet activation only, no SALLY invite)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  activate: async (driverId: string): Promise<any> => {
    return apiClient(`/drivers/${driverId}/activate`, { method: 'POST' });
  },

  /**
   * Deactivate a driver
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deactivate: async (driverId: string, reason?: string): Promise<any> => {
    return apiClient(`/drivers/${driverId}/deactivate`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  /**
   * Reactivate an inactive driver
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reactivate: async (driverId: string): Promise<any> => {
    return apiClient(`/drivers/${driverId}/reactivate`, { method: 'POST' });
  },

  /**
   * Get weekly stats for a driver
   */
  getWeeklyStats: async (
    driverId: string,
  ): Promise<{ loadsCompleted: number; milesDriven: number; earningsCents: number }> => {
    return apiClient<{ loadsCompleted: number; milesDriven: number; earningsCents: number }>(
      `/drivers/${driverId}/weekly-stats`,
    );
  },
};

// Re-export legacy functions for backwards compatibility during migration
export const listDrivers = driversApi.list;
export const getDriver = driversApi.getById;
export const createDriver = driversApi.create;
export const updateDriver = driversApi.update;
export const getDriverHOS = driversApi.getHOS;
