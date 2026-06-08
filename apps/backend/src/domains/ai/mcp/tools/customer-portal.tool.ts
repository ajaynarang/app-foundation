import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { LoadStatus } from '@prisma/client';
import { formatLoadLabel } from '@sally/shared-types';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { RequiresScope } from '../../agent-contract/requires-scope.decorator';

/**
 * Customer Portal MCP Tools — read-only tools for customer shipment visibility.
 *
 * All queries are scoped via `_userId`, which maps to the customer's user record.
 * The user's `customerId` is resolved from the database to filter loads.
 * `_tenantId` provides tenant isolation. Both are injected by McpToolService
 * from the authenticated session — NEVER from AI input.
 */
@Injectable()
export class CustomerPortalTool {
  constructor(private readonly prisma: PrismaService) {}

  private async getCustomerId(userId: string): Promise<number | null> {
    const user = await this.prisma.user.findFirst({
      where: { userId },
      select: { customerId: true },
    });
    return user?.customerId ?? null;
  }

  @RequiresScope('customers:read')
  @Tool({
    name: 'query-my-shipments',
    description:
      "List the customer's shipments. Filter by status (booked, in_transit, delivered, on_hold, cancelled). Returns up to 20 shipments with origin, destination, and status.",
    parameters: z.object({
      status: z
        .string()
        .optional()
        .describe('Filter by status: booked (includes assigned/dispatched), in_transit, delivered, on_hold, cancelled'),
      limit: z.number().min(1).max(50).default(20).describe('Max results to return'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async queryMyShipments({
    status,
    limit,
    _tenantId,
    _userId,
  }: {
    status?: string;
    limit: number;
    _tenantId?: number;
    _userId?: string;
  }) {
    if (!_userId) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: 'User context required' }),
          },
        ],
      };
    }

    const customerId = await this.getCustomerId(_userId);
    if (!customerId) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: 'No customer account linked' }),
          },
        ],
      };
    }

    // Map customer-friendly status to internal statuses
    let statusFilter: string[] | undefined;
    if (status === 'booked') {
      statusFilter = ['ASSIGNED', 'DISPATCHED'];
    } else if (status) {
      statusFilter = [status];
    }

    const loads = await this.prisma.load.findMany({
      where: {
        ...(_tenantId !== undefined && { tenantId: _tenantId }),
        customerId,
        ...(statusFilter && { status: { in: statusFilter } }),
        // Only customer-visible statuses
        ...(!statusFilter && {
          status: {
            in: [
              LoadStatus.ASSIGNED,
              LoadStatus.IN_TRANSIT,
              LoadStatus.DELIVERED,
              LoadStatus.ON_HOLD,
              LoadStatus.CANCELLED,
            ],
          },
        }),
      },
      include: {
        stops: {
          include: {
            stop: { select: { name: true, city: true, state: true } },
          },
          orderBy: { sequenceOrder: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            count: loads.length,
            shipments: loads.map((l) => {
              const displayStatus = l.status === LoadStatus.ASSIGNED ? 'booked' : l.status;
              const firstStop = l.stops[0]?.stop;
              const lastStop = l.stops[l.stops.length - 1]?.stop;
              return {
                shipmentNumber: l.loadNumber,
                shipmentLabel: formatLoadLabel(l.loadNumber, l.referenceNumber),
                status: displayStatus,
                origin: firstStop ? `${firstStop.city}, ${firstStop.state}` : l.customerName,
                destination: lastStop ? `${lastStop.city}, ${lastStop.state}` : 'TBD',
                referenceNumber: l.referenceNumber,
                createdAt: l.createdAt.toISOString(),
              };
            }),
          }),
        },
      ],
    };
  }

  @RequiresScope('customers:read')
  @Tool({
    name: 'get-shipment-detail',
    description:
      'Get full details for a specific shipment including all stops, current progress, and estimated delivery.',
    parameters: z.object({
      shipmentNumber: z.string().describe('The shipment/load number to look up'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async getShipmentDetail({
    shipmentNumber,
    _tenantId,
    _userId,
  }: {
    shipmentNumber: string;
    _tenantId?: number;
    _userId?: string;
  }) {
    if (!_userId) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: 'User context required' }),
          },
        ],
      };
    }

    const customerId = await this.getCustomerId(_userId);
    if (!customerId) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: 'No customer account linked' }),
          },
        ],
      };
    }

    const load = await this.prisma.load.findFirst({
      where: {
        ...(_tenantId !== undefined && { tenantId: _tenantId }),
        customerId,
        OR: [
          {
            loadNumber: {
              contains: shipmentNumber,
              mode: 'insensitive' as const,
            },
          },
          {
            referenceNumber: {
              contains: shipmentNumber,
              mode: 'insensitive' as const,
            },
          },
        ],
      },
      include: {
        stops: {
          include: {
            stop: {
              select: { name: true, city: true, state: true, address: true },
            },
          },
          orderBy: { sequenceOrder: 'asc' },
        },
      },
    });

    if (!load) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: `No shipment found matching "${shipmentNumber}"`,
            }),
          },
        ],
      };
    }

    const displayStatus = ['ASSIGNED', 'DISPATCHED'].includes(load.status) ? 'booked' : load.status;

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            shipmentNumber: load.loadNumber,
            shipmentLabel: formatLoadLabel(load.loadNumber, load.referenceNumber),
            status: displayStatus,
            referenceNumber: load.referenceNumber,
            requiredEquipmentType: load.requiredEquipmentType ?? null,
            weightLbs: load.weightLbs,
            commodity: load.commodityType,
            estimatedMiles: load.estimatedMiles,
            createdAt: load.createdAt.toISOString(),
            stops: load.stops.map((ls) => ({
              type: ls.actionType === 'pickup' ? 'Pickup' : 'Delivery',
              facility: ls.stop.name,
              address: ls.stop.address,
              location: `${ls.stop.city}, ${ls.stop.state}`,
              status: ls.status,
              appointmentDate: ls.appointmentDate?.toISOString(),
              arrivedAt: ls.arrivedAt?.toISOString(),
              completedAt: ls.completedAt?.toISOString(),
            })),
          }),
        },
      ],
    };
  }

  @RequiresScope('customers:read')
  @Tool({
    name: 'get-my-documents',
    description: 'Get documents (BOL, POD, rate confirmation) for a specific shipment.',
    parameters: z.object({
      shipmentNumber: z.string().describe('The shipment/load number to get documents for'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async getMyDocuments({
    shipmentNumber,
    _tenantId,
    _userId,
  }: {
    shipmentNumber: string;
    _tenantId?: number;
    _userId?: string;
  }) {
    if (!_userId) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: 'User context required' }),
          },
        ],
      };
    }

    const customerId = await this.getCustomerId(_userId);
    if (!customerId) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: 'No customer account linked' }),
          },
        ],
      };
    }

    // Find the load first to verify ownership
    const load = await this.prisma.load.findFirst({
      where: {
        ...(_tenantId !== undefined && { tenantId: _tenantId }),
        customerId,
        OR: [
          {
            loadNumber: {
              contains: shipmentNumber,
              mode: 'insensitive' as const,
            },
          },
        ],
      },
      select: {
        id: true,
        loadNumber: true,
        referenceNumber: true,
      },
    });

    if (!load) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: `No shipment found matching "${shipmentNumber}"`,
            }),
          },
        ],
      };
    }

    // Query documents for this load (polymorphic entity pattern)
    const documents = await this.prisma.document.findMany({
      where: {
        entityType: 'load',
        entityId: load.id,
        ...(_tenantId !== undefined && { tenantId: _tenantId }),
      },
      select: {
        id: true,
        documentType: true,
        fileName: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            shipmentNumber: load.loadNumber,
            shipmentLabel: formatLoadLabel(load.loadNumber, load.referenceNumber),
            documents: documents.map((d) => ({
              documentId: d.id,
              type: d.documentType,
              fileName: d.fileName,
              status: d.status,
              uploadedAt: d.createdAt?.toISOString(),
            })),
            count: documents.length,
          }),
        },
      ],
    };
  }

  @RequiresScope('customers:read')
  @Tool({
    name: 'get-my-invoices',
    description:
      'List invoices and payment status for the customer. Shows invoice amounts, due dates, and payment status.',
    parameters: z.object({
      status: z.string().optional().describe('Filter by invoice status: DRAFT, SENT, PAID, OVERDUE, VOID'),
      limit: z.number().min(1).max(50).default(20).describe('Max results to return'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async getMyInvoices({
    status,
    limit,
    _tenantId,
    _userId,
  }: {
    status?: string;
    limit: number;
    _tenantId?: number;
    _userId?: string;
  }) {
    if (!_userId) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: 'User context required' }),
          },
        ],
      };
    }

    const customerId = await this.getCustomerId(_userId);
    if (!customerId) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: 'No customer account linked' }),
          },
        ],
      };
    }

    const VALID_INVOICE_STATUSES = ['DRAFT', 'SENT', 'PAID', 'OVERDUE', 'VOID'] as const;
    if (status && !VALID_INVOICE_STATUSES.includes(status as any)) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: `Invalid status "${status}". Valid: ${VALID_INVOICE_STATUSES.join(', ')}`,
            }),
          },
        ],
      };
    }

    const invoices = await this.prisma.invoice.findMany({
      where: {
        ...(_tenantId !== undefined && { tenantId: _tenantId }),
        customerId,
        ...(status && {
          status: status as (typeof VALID_INVOICE_STATUSES)[number],
        }),
      },
      include: {
        lineItems: { select: { description: true, totalCents: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            count: invoices.length,
            invoices: invoices.map((inv) => ({
              invoiceNumber: inv.invoiceNumber,
              status: inv.status,
              totalAmount: `$${(inv.totalCents / 100).toFixed(2)}`,
              paidAmount: `$${(inv.paidCents / 100).toFixed(2)}`,
              balanceDue: `$${(inv.balanceCents / 100).toFixed(2)}`,
              issueDate: inv.issueDate,
              dueDate: inv.dueDate,
              lineItems: inv.lineItems.map((li: { description: string; totalCents: number }) => ({
                description: li.description,
                amount: `$${(li.totalCents / 100).toFixed(2)}`,
              })),
            })),
          }),
        },
      ],
    };
  }
}
