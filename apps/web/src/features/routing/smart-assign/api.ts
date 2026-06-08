/**
 * Smart Assign API client
 * Endpoints:
 *   GET  /loads/:loadId/driver-recommendations
 *   POST /loads/:loadId/generate-route
 *   POST /loads/:loadId/assign-with-route
 *   DELETE /routes/:planId/draft
 */

import { apiClient } from '@/shared/lib/api';
import type { DriverRecommendationsResponse } from './types';
import type { GenerateRouteParams } from './types';
import type { RoutePlanResult } from '../route-planning/types';
import type { LoadLeg, AssignAllLegsInput } from '@sally/shared-types';

export const smartAssignApi = {
  /**
   * Get AI-ranked driver recommendations for a load
   * GET /api/v1/loads/:loadId/driver-recommendations
   */
  getDriverRecommendations: async (loadId: string): Promise<DriverRecommendationsResponse> => {
    return apiClient<DriverRecommendationsResponse>(`/loads/${loadId}/driver-recommendations`);
  },

  /**
   * Generate a draft route plan for the selected driver/vehicle
   * POST /api/v1/loads/:loadId/generate-route
   */
  generateRoute: async (loadId: string, params: GenerateRouteParams): Promise<RoutePlanResult> => {
    return apiClient<RoutePlanResult>(`/loads/${loadId}/generate-route`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  /**
   * Assign a load and activate the route plan in one step
   * POST /api/v1/loads/:loadId/assign-with-route
   */
  assignWithRoute: async (loadId: string, planId: string): Promise<RoutePlanResult> => {
    return apiClient<RoutePlanResult>(`/loads/${loadId}/assign-with-route`, {
      method: 'POST',
      body: JSON.stringify({ planId }),
    });
  },

  /**
   * Discard a draft route plan
   * DELETE /api/v1/routes/:planId/draft
   */
  discardDraft: async (planId: string): Promise<void> => {
    return apiClient(`/routes/${planId}/draft`, {
      method: 'DELETE',
    });
  },

  /**
   * Assign all legs of a relay load in one call
   * POST /api/v1/loads/:loadId/assign-all-legs
   */
  assignAllLegs: async (loadId: string, assignments: AssignAllLegsInput['assignments']): Promise<LoadLeg[]> => {
    return apiClient<LoadLeg[]>(`/loads/${loadId}/assign-all-legs`, {
      method: 'POST',
      body: JSON.stringify({ assignments }),
    });
  },
};
