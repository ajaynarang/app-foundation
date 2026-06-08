import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { formatLoadLabel } from '@app/shared-types';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { errorResponse } from '../utils/entity-resolver';
import { RequiresScope } from '../../../agent-contract/requires-scope.decorator';

/**
 * Load Read MCP Tools — detailed read-only tools for individual load data.
 *
 * All queries are tenant-scoped via `_tenantId`, which is injected by
 * McpToolService from the authenticated session — NEVER from AI input.
 * The AI cannot see or override the _tenantId parameter.
 */
@Injectable()
export class LoadReadTool {
  constructor(private readonly prisma: PrismaService) {}

  @RequiresScope('fleet:read')
  @Tool({
    name: 'get-load-detail',
    description:
      'Get full details for a single load by load number OR PO/reference number: all stops with status, driver, vehicle, customer, rate, charges, documents, notes. Returns a pre-formatted `loadLabel` (e.g. `#LD-001 · PO-12345`) — use this whenever referring to the load in your response so dispatchers see the PO/Ref. For relay loads, includes per-leg breakdown with driver, status, and miles. Use when dispatcher asks "show me load L-1045", "what\'s the status of 1045", or "find load PO-4521". Do NOT use for listing loads — use query-loads.',
    parameters: z.object({
      loadNumber: z
        .string()
        .describe('Load number OR PO/reference number to look up, e.g. "L-1045", "1045", or "PO-4521"'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
    }),
  })
  async getLoadDetail({ loadNumber, _tenantId }: { loadNumber: string; _tenantId?: number }) {
    if (!_tenantId) return errorResponse('Session error: no tenant context.');

    // Normalize: strip "L-" prefix if present
    const normalized = loadNumber.replace(/^L-/i, '');

    // Search by loadNumber first, then fall back to referenceNumber (PO/ref)
    const load = await this.prisma.load.findFirst({
      where: {
        tenantId: _tenantId,
        OR: [
          {
            loadNumber: { contains: normalized, mode: 'insensitive' as const },
          },
          {
            referenceNumber: {
              contains: normalized,
              mode: 'insensitive' as const,
            },
          },
        ],
      },
      include: {
        stops: {
          orderBy: { sequenceOrder: 'asc' },
          include: {
            stop: {
              select: { name: true, city: true, state: true },
            },
          },
        },
        driver: { select: { name: true, driverId: true } },
        vehicle: { select: { unitNumber: true, vehicleId: true } },
        customer: { select: { companyName: true } },
        legs: {
          orderBy: { sequence: 'asc' },
          include: {
            driver: { select: { name: true, driverId: true } },
            vehicle: { select: { unitNumber: true, vehicleId: true } },
          },
        },
        notes: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        trip: { select: { tripId: true, loadCount: true } },
      },
    });

    if (!load) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: `No load found matching "${loadNumber}"`,
            }),
          },
        ],
      };
    }

    // Count documents via polymorphic Document table
    const documentCount = await this.prisma.document.count({
      where: {
        entityType: 'load',
        entityId: load.id,
      },
    });

    const loadDetail = {
      loadNumber: load.loadNumber,
      // Pre-formatted display label for chat responses ("#LD-001 · PO-12345").
      loadLabel: formatLoadLabel(load.loadNumber, load.referenceNumber),
      status: load.status,
      customerName: load.customer?.companyName ?? load.customerName,
      rateDollars: load.rateCents != null ? (load.rateCents / 100).toFixed(2) : null,
      weightLbs: load.weightLbs,
      commodityType: load.commodityType,
      requiredEquipmentType: load.requiredEquipmentType ?? null,
      referenceNumber: load.referenceNumber,
      specialRequirements: load.specialRequirements,
      driver: load.driver?.name ?? null,
      vehicle: load.vehicle?.unitNumber ?? null,
      stops: load.stops.map((ls) => ({
        type: ls.actionType,
        facility: ls.stop.name,
        location: `${ls.stop.city}, ${ls.stop.state}`,
        sequence: ls.sequenceOrder,
        status: ls.status,
      })),
      tripId: (load as any).trip?.tripId ?? null,
      tripOrder: (load as any).tripOrder ?? null,
      tripLoadCount: (load as any).trip?.loadCount ?? null,
      documentCount,
      noteCount: load.notes.length,
      pickupDate: load.pickupDate?.toISOString() ?? null,
      deliveryDate: load.deliveryDate?.toISOString() ?? null,
      ...(load.isRelay && {
        isRelay: true,
        legs: load.legs.map((leg) => ({
          legId: leg.legId,
          sequence: leg.sequence,
          status: leg.status,
          driver: leg.driver?.name ?? 'Unassigned',
          vehicle: leg.vehicle?.unitNumber ?? null,
          miles: leg.actualMiles ?? null,
        })),
      }),
    };

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(loadDetail),
        },
      ],
      _card: { type: 'load_detail' as const, data: loadDetail },
    };
  }
}
