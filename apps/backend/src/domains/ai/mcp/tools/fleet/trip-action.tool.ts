import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { TripService } from '../../../../fleet/trips/trip.service';
import { errorResponse } from '../utils/entity-resolver';
import { RequiresScope } from '../../../agent-contract/requires-scope.decorator';

/**
 * Trip MCP Tools — create, query, and manage trips (grouped loads for a single driver/truck).
 *
 * All queries are tenant-scoped via `_tenantId`, which is injected by
 * McpToolService from the authenticated session — NEVER from AI input.
 */
@Injectable()
export class TripActionTool {
  constructor(private readonly tripService: TripService) {}

  @RequiresScope('loads:write')
  @Tool({
    name: 'create-trip',
    description:
      'Create a trip — group 2-10 loads into a single trip for one driver/truck. ' +
      'Use when dispatcher says "group these loads together" or "create a trip for loads X, Y, Z." ' +
      'Loads must be draft or pending, not in another trip, and not relay loads.',
    parameters: z.object({
      loadIds: z
        .array(z.string())
        .min(2)
        .max(10)
        .describe('Array of load IDs to group (e.g. ["LOAD-LD-20260409-001", "LOAD-LD-20260409-002"])'),
      driverId: z.string().optional().describe('Driver string ID to assign (optional — creates draft if omitted)'),
      vehicleId: z.string().optional().describe('Vehicle string ID to assign (required if driverId provided)'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async createTrip({
    loadIds,
    driverId,
    vehicleId,
    _tenantId,
    _userId,
  }: {
    loadIds: string[];
    driverId?: string;
    vehicleId?: string;
    _tenantId?: number;
    _userId?: string;
  }) {
    if (!_tenantId) return errorResponse('Session error: no tenant context.');
    const userId = Number(_userId);
    if (!userId) return errorResponse('Session error: no user context.');

    try {
      const result = await this.tripService.create(_tenantId, { loadIds, driverId, vehicleId }, userId);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: `Trip ${result.tripId} created with ${result.loadCount} loads`,
              tripId: result.tripId,
              status: result.status,
              loadCount: result.loadCount,
              totalRevenueCents: result.totalRevenueCents,
            }),
          },
        ],
      };
    } catch (error: any) {
      return errorResponse(error.message || 'Failed to create trip');
    }
  }

  @RequiresScope('loads:read')
  @Tool({
    name: 'get-trip-detail',
    description:
      'Get trip details including all loads, driver, vehicle, financials, and status. ' +
      'Use when dispatcher asks about a specific trip.',
    parameters: z.object({
      tripId: z.string().describe('Trip ID (e.g. "CNV-20260409-001")'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
    }),
  })
  async getTripDetail({ tripId, _tenantId }: { tripId: string; _tenantId?: number }) {
    if (!_tenantId) return errorResponse('Session error: no tenant context.');

    try {
      const trip = await this.tripService.findOne(_tenantId, tripId);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              ...trip,
              _card: {
                title: `Trip ${trip.tripId}`,
                subtitle: `${trip.loadCount} loads · ${trip.status} · $${((trip.totalRevenueCents ?? 0) / 100).toLocaleString()}`,
              },
            }),
          },
        ],
      };
    } catch (error: any) {
      return errorResponse(error.message || 'Failed to get trip');
    }
  }

  @RequiresScope('loads:write')
  @Tool({
    name: 'add-load-to-trip',
    description:
      'Add a load to an existing trip. The load must be draft, pending, or assigned, ' +
      'and not already in another trip. Max 10 loads per trip.',
    parameters: z.object({
      tripId: z.string().describe('Trip ID'),
      loadNumber: z.string().describe('Load number to add (e.g. "LD-20260101-001")'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async addLoadToTrip({
    tripId,
    loadNumber,
    _tenantId,
    _userId,
  }: {
    tripId: string;
    loadNumber: string;
    _tenantId?: number;
    _userId?: string;
  }) {
    if (!_tenantId) return errorResponse('Session error: no tenant context.');
    const userId = Number(_userId);
    if (!userId) return errorResponse('Session error: no user context.');

    try {
      const result = await this.tripService.addLoad(_tenantId, tripId, loadNumber, userId);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: `Load added to trip ${tripId}. Now has ${result.loadCount} loads.`,
            }),
          },
        ],
      };
    } catch (error: any) {
      return errorResponse(error.message || 'Failed to add load to trip');
    }
  }

  @RequiresScope('loads:write')
  @Tool({
    name: 'remove-load-from-trip',
    description:
      'Remove a load from a trip. The trip must keep at least 2 loads. ' +
      'If removing would leave 1 load, cancel the trip instead.',
    parameters: z.object({
      tripId: z.string().describe('Trip ID'),
      loadNumber: z.string().describe('Load number to remove (e.g. "LD-20260101-001")'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async removeLoadFromTrip({
    tripId,
    loadNumber,
    _tenantId,
    _userId,
  }: {
    tripId: string;
    loadNumber: string;
    _tenantId?: number;
    _userId?: string;
  }) {
    if (!_tenantId) return errorResponse('Session error: no tenant context.');
    const userId = Number(_userId);
    if (!userId) return errorResponse('Session error: no user context.');

    try {
      const result = await this.tripService.removeLoad(_tenantId, tripId, loadNumber, userId);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: `Load removed from trip ${tripId}. Now has ${result.loadCount} loads.`,
            }),
          },
        ],
      };
    } catch (error: any) {
      return errorResponse(error.message || 'Failed to remove load from trip');
    }
  }
}
