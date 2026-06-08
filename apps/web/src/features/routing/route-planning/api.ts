/**
 * Route Planning API client
 * Endpoints: POST /routes/plan, GET /routes, GET /routes/:planId,
 *            POST /routes/:planId/activate, POST /routes/:planId/cancel
 */

import { apiClient } from '@/shared/lib/api';
import type { FeatureCollection } from 'geojson';
import type { CreateRoutePlanRequest, RoutePlanResult, RoutePlanListResponse, RoutePlanPreviewResult } from './types';

export const routePlanningApi = {
  /**
   * Plan a new route
   * POST /api/v1/routes/plan
   */
  plan: async (data: CreateRoutePlanRequest): Promise<RoutePlanResult> => {
    return apiClient<RoutePlanResult>('/routes/plan', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * List route plans with optional filters
   * GET /api/v1/routes
   */
  list: async (params?: {
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
  }): Promise<RoutePlanListResponse> => {
    const queryParams = new URLSearchParams();
    if (params?.status) queryParams.set('status', params.status);
    if (params?.dateFrom) queryParams.set('dateFrom', params.dateFrom);
    if (params?.dateTo) queryParams.set('dateTo', params.dateTo);
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.offset) queryParams.set('offset', params.offset.toString());

    const queryString = queryParams.toString();
    const url = queryString ? `/routes?${queryString}` : '/routes';

    return apiClient<RoutePlanListResponse>(url);
  },

  /**
   * Get a specific route plan by planId
   * GET /api/v1/routes/:planId
   */
  getById: async (planId: string): Promise<RoutePlanResult> => {
    return apiClient<RoutePlanResult>(`/routes/${planId}`);
  },

  /**
   * Activate a route plan
   * POST /api/v1/routes/:planId/activate
   */
  activate: async (planId: string, options?: { confirmReassignment?: boolean }): Promise<RoutePlanResult> => {
    return apiClient<RoutePlanResult>(`/routes/${planId}/activate`, {
      method: 'POST',
      body: options ? JSON.stringify(options) : undefined,
    });
  },

  /**
   * Cancel a route plan
   * POST /api/v1/routes/:planId/cancel
   */
  cancel: async (planId: string): Promise<RoutePlanResult> => {
    return apiClient<RoutePlanResult>(`/routes/${planId}/cancel`, {
      method: 'POST',
    });
  },

  /**
   * Get the active route plan for a driver
   * GET /api/v1/routes/driver/:driverId/active
   */
  getDriverActive: async (driverId: string): Promise<RoutePlanResult | null> => {
    try {
      return await apiClient<RoutePlanResult>(`/routes/driver/${driverId}/active`);
    } catch (error) {
      if ((error as { status?: number })?.status === 404) return null;
      throw error;
    }
  },

  /**
   * Update a segment's status
   * POST /api/v1/routes/:planId/segments/:segmentId/status
   */
  updateSegmentStatus: async (
    planId: string,
    segmentId: string,
    data: { status: string; actualArrival?: string; actualDeparture?: string },
  ): Promise<void> => {
    await apiClient(`/routes/${planId}/segments/${segmentId}/status`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Get GeoJSON for a route plan (map rendering)
   * GET /api/v1/routes/:planId/geojson
   */
  getGeoJSON: async (planId: string): Promise<FeatureCollection> => {
    return apiClient<FeatureCollection>(`/routes/${planId}/geojson`);
  },

  /**
   * Request a replan of an existing route
   * POST /api/v1/routes/:planId/replan
   */
  replan: async (planId: string, reason?: string): Promise<RoutePlanResult> => {
    return apiClient<RoutePlanResult>(`/routes/${planId}/replan`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  /**
   * Preview the impact of changed params WITHOUT persisting (WhatIf panel).
   * POST /api/v1/routes/:planId/preview
   */
  preview: async (
    planId: string,
    changes: { preferredRestType?: string; avoidTollRoads?: boolean; departureTimeShiftHours?: number },
  ): Promise<RoutePlanPreviewResult> => {
    return apiClient<RoutePlanPreviewResult>(`/routes/${planId}/preview`, {
      method: 'POST',
      body: JSON.stringify(changes),
    });
  },

  /**
   * Submit feedback on a segment decision
   * POST /api/v1/routes/:planId/segments/:segmentId/feedback
   */
  submitFeedback: async (
    planId: string,
    segmentId: string,
    data: { rating: 'good' | 'bad'; reason?: string },
  ): Promise<void> => {
    await apiClient(`/routes/${planId}/segments/${segmentId}/feedback`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Geocode all stops missing coordinates for the given loads.
   * POST /api/v1/routes/geocode-stops
   */
  geocodeStops: async (
    loadIds: string[],
  ): Promise<{
    geocoded: number;
    failed: number;
    total: number;
  }> => {
    return apiClient<{ geocoded: number; failed: number; total: number }>('/routes/geocode-stops', {
      method: 'POST',
      body: JSON.stringify({ loadIds }),
    });
  },
};
