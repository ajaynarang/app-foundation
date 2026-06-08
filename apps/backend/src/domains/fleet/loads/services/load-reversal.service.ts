import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';
import { LoadEventsService } from './load-events.service';
import { getReversalDefinition, type CascadeAction } from '../utils/load-reversal-config';

/** Billing statuses that block a reversal (invoice is beyond draft). */
const BLOCKING_INVOICE_STATUSES = ['SENT', 'VIEWED', 'PARTIAL', 'OVERDUE', 'FACTORED', 'PAID'];

/**
 * Known nullable fields on the Load model.
 * Used to filter clearFields from reversal config so we never pass
 * an unknown column name to Prisma.
 */
const LOAD_NULLABLE_FIELDS = new Set([
  'deliveredAt',
  'billingStatus',
  'inTransitAt',
  'assignedAt',
  'cancelledAt',
  'tonuAt',
  'tonuReason',
  'onHoldAt',
  'onHoldReason',
  'driverId',
  'vehicleId',
]);

/** Roles allowed to execute reversals. */
const ALLOWED_ROLES = new Set(['OWNER', 'ADMIN', 'DISPATCHER']);

@Injectable()
export class LoadReversalService {
  private readonly logger = new Logger(LoadReversalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventService,
    private readonly loadEventsService: LoadEventsService,
  ) {}

  // ── Preview ──────────────────────────────────────────────

  async previewReversal(tenantId: number, loadNumber: string, targetStatus: string) {
    const load = await this.prisma.load.findFirst({
      where: { loadNumber, tenantId },
    });
    if (!load) throw new NotFoundException(`Load not found: ${loadNumber}`);

    const definition = getReversalDefinition(load.status, targetStatus);
    if (!definition) {
      throw new BadRequestException(`No reversal path from "${load.status}" to "${targetStatus}"`);
    }

    const warnings: string[] = [];

    // Time-window warning
    if (definition.timeWindowDays !== null) {
      const statusTimestamp = this.getStatusTimestamp(load, load.status);
      if (statusTimestamp) {
        const daysSince = this.daysSince(statusTimestamp);
        if (daysSince > definition.timeWindowDays) {
          warnings.push(
            `Load has been in "${load.status}" for ${Math.round(daysSince)} days (window: ${definition.timeWindowDays} days). Requires ${definition.escalatedRole} approval.`,
          );
        }
      }
    }

    // Check billing blockers
    const blockingInvoices = await this.prisma.invoice.findMany({
      where: {
        loadId: load.id,
        status: { in: BLOCKING_INVOICE_STATUSES as any },
      },
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        totalCents: true,
      },
    });

    const blocked = blockingInvoices.length > 0;
    const blockReason = blocked
      ? `Cannot revert: ${blockingInvoices.length} invoice(s) have progressed past draft status (${blockingInvoices.map((i) => `${i.invoiceNumber}: ${i.status}`).join(', ')})`
      : null;

    // Affected entities
    const affectedInvoices = await this.prisma.invoice.findMany({
      where: { loadId: load.id, status: 'DRAFT' },
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        totalCents: true,
      },
    });

    const rawSettlementLines = await this.prisma.settlementLineItem.findMany({
      where: {
        loadId: load.id,
        settlement: { status: 'DRAFT' },
      },
      select: {
        id: true,
        payAmountCents: true,
        settlement: {
          select: { settlementNumber: true, status: true },
        },
      },
    });
    const affectedSettlementLines = rawSettlementLines.map((sl: any) => ({
      id: sl.id,
      settlementNumber: sl.settlement.settlementNumber,
      settlementStatus: sl.settlement.status,
      payAmountCents: sl.payAmountCents,
    }));

    const affectedStops = await this.prisma.loadStop.findMany({
      where: {
        loadId: load.id,
        status: { not: 'PENDING' },
      },
      select: {
        id: true,
        sequenceOrder: true,
        status: true,
        actionType: true,
      },
    });

    return {
      from: load.status,
      to: targetStatus,
      affectedInvoices,
      affectedSettlementLines,
      affectedStops,
      warnings,
      blocked,
      blockReason,
    };
  }

  // ── Execute ──────────────────────────────────────────────

  async executeReversal(
    tenantId: number,
    loadNumber: string,
    targetStatus: string,
    category: string,
    reason: string,
    userId: number,
    userRole: string,
  ) {
    const load = await this.prisma.load.findFirst({
      where: { loadNumber, tenantId },
    });
    if (!load) throw new NotFoundException(`Load not found: ${loadNumber}`);

    const definition = getReversalDefinition(load.status, targetStatus);
    if (!definition) {
      throw new BadRequestException(`No reversal path from "${load.status}" to "${targetStatus}"`);
    }

    // ── Role validation ──
    if (!ALLOWED_ROLES.has(userRole)) {
      throw new ForbiddenException('Only OWNER, ADMIN, or DISPATCHER roles can execute reversals');
    }

    // Time-window escalation check
    if (definition.timeWindowDays !== null && definition.escalatedRole) {
      const statusTimestamp = this.getStatusTimestamp(load, load.status);
      if (statusTimestamp) {
        const daysSince = this.daysSince(statusTimestamp);
        if (daysSince > definition.timeWindowDays) {
          const escalatedRoles = this.getEscalatedRoles(definition.escalatedRole);
          if (!escalatedRoles.includes(userRole)) {
            throw new ForbiddenException(
              `Reversal requires ${definition.escalatedRole} role or higher — load has been in "${load.status}" for ${Math.round(daysSince)} days (window: ${definition.timeWindowDays} days)`,
            );
          }
        }
      }
    }

    // ── Billing blocker check ──
    if (definition.billingBlockers.length > 0) {
      const blockingInvoices = await this.prisma.invoice.findMany({
        where: {
          loadId: load.id,
          status: { in: BLOCKING_INVOICE_STATUSES as any },
        },
        select: { invoiceNumber: true, status: true },
      });

      if (blockingInvoices.length > 0) {
        throw new ConflictException(
          `Cannot revert: ${blockingInvoices.length} invoice(s) have progressed past draft (${blockingInvoices.map((i) => `${i.invoiceNumber}: ${i.status}`).join(', ')}). Void or adjust invoices first.`,
        );
      }
    }

    // ── Execute cascades in transaction ──
    const previousStatus = load.status;

    const updatedLoad = await this.prisma.$transaction(async (tx) => {
      // Optimistic lock: re-verify the load status hasn't changed since we read it
      const freshLoad = await tx.load.findUnique({
        where: { id: load.id },
        select: { status: true },
      });
      if (!freshLoad || freshLoad.status !== previousStatus) {
        throw new ConflictException(
          `Load status has changed (expected ${previousStatus}, found ${freshLoad?.status ?? 'deleted'}). Please retry.`,
        );
      }

      // Run each cascade action
      for (const cascade of definition.cascades) {
        await this.executeCascade(tx, load.id, cascade);
      }

      // Build update data: set status + null out clearFields
      const updateData: Record<string, any> = {
        status: targetStatus,
      };
      for (const field of definition.clearFields) {
        if (LOAD_NULLABLE_FIELDS.has(field)) {
          updateData[field] = null;
        }
      }

      return tx.load.update({
        where: { id: load.id },
        data: updateData,
        include: {
          stops: {
            include: { stop: true },
            orderBy: { sequenceOrder: 'asc' },
          },
        },
      });
    });

    // ── Post-transaction side effects (fire-and-forget) ──

    // Log event
    this.loadEventsService
      .logEvent({
        loadId: load.id,
        eventType: 'status_reversal',
        fromValue: previousStatus,
        toValue: targetStatus,
        description: `[${category}] ${reason}`,
        userId,
        metadata: { category, reason },
      })
      .catch((err) => this.logger.error(`Failed to log reversal event: ${err.message}`));

    // Emit domain event
    await this.events.emit(SALLY_EVENTS.LOAD_STATUS_REVERSED, load.tenantId, {
      loadNumber: load.loadNumber,
      fromStatus: previousStatus,
      toStatus: targetStatus,
      category,
      reason,
      userId,
    });

    this.logger.log(`Load ${loadNumber} reversed from ${previousStatus} to ${targetStatus} [${category}]`);

    return updatedLoad;
  }

  // ── Private helpers ──────────────────────────────────────

  private async executeCascade(tx: any, loadId: number, cascade: CascadeAction): Promise<void> {
    switch (cascade) {
      case 'reset_active_stops':
        await tx.loadStop.updateMany({
          where: {
            loadId,
            status: { in: ['ARRIVED', 'IN_PROGRESS'] },
          },
          data: { status: 'PENDING', arrivedAt: null },
        });
        break;

      case 'supersede_route_plan': {
        const routePlanLoads = await tx.routePlanLoad.findMany({
          where: { loadId },
          select: { planId: true },
        });
        const planIds = routePlanLoads.map((rpl: any) => rpl.planId);
        if (planIds.length > 0) {
          await tx.routePlan.updateMany({
            where: {
              id: { in: planIds },
              isActive: true,
            },
            data: {
              isActive: false,
              status: 'SUPERSEDED',
            },
          });
        }
        break;
      }

      case 'reset_delivery_stop':
        // Revert COMPLETED stops back to ARRIVED — IN_TRANSIT is a load-level
        // state, never a stop-level state.
        await tx.loadStop.updateMany({
          where: { loadId, status: 'COMPLETED' },
          data: { status: 'ARRIVED', completedAt: null },
        });
        break;

      case 'clear_pod':
        await tx.loadStop.updateMany({
          where: { loadId },
          data: {
            podSignedAt: null,
            podSignedBy: null,
            podSignatureUrl: null,
          },
        });
        break;

      case 'void_draft_invoice':
      case 'void_any_draft_invoices':
      case 'void_tonu_draft_invoice':
        await tx.invoice.updateMany({
          where: { loadId, status: 'DRAFT' },
          data: { status: 'VOID' },
        });
        break;

      case 'remove_draft_settlement_lines': {
        const draftLines = await tx.settlementLineItem.findMany({
          where: {
            loadId,
            settlement: { status: 'DRAFT' },
          },
          select: { id: true },
        });
        if (draftLines.length > 0) {
          await tx.settlementLineItem.deleteMany({
            where: { id: { in: draftLines.map((l: any) => l.id) } },
          });
        }
        break;
      }

      case 'clear_assignment':
        // Handled via clearFields on the main load update
        break;

      case 'clear_in_transit_timestamps':
        // Handled via clearFields on the main load update
        break;

      default:
        this.logger.warn(`Unknown cascade action: ${String(cascade)}`);
    }
  }

  /**
   * Get the timestamp for when a load entered its current status.
   */
  private getStatusTimestamp(load: any, status: string): Date | null {
    const fieldMap: Record<string, string> = {
      CANCELLED: 'cancelledAt',
      TONU: 'tonuAt',
      DELIVERED: 'deliveredAt',
      IN_TRANSIT: 'inTransitAt',
      ASSIGNED: 'assignedAt',
    };
    const field = fieldMap[status];
    return field ? (load[field] ?? null) : null;
  }

  /**
   * Get roles that satisfy an escalation requirement.
   * ADMIN includes OWNER; OWNER is just OWNER.
   */
  private getEscalatedRoles(escalatedRole: string): string[] {
    if (escalatedRole === 'ADMIN') return ['ADMIN', 'OWNER'];
    if (escalatedRole === 'OWNER') return ['OWNER'];
    return [escalatedRole];
  }

  private daysSince(date: Date): number {
    return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
  }
}
