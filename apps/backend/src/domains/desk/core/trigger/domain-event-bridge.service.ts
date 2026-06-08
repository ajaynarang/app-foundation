import { Injectable, Logger } from '@nestjs/common';
import { DESK_OUTCOMES } from '../../shared-steps/outcomes';
import { OnEvent } from '@nestjs/event-emitter';
import { EpisodeStatusSchema, OPEN_EPISODE_STATUSES } from '@app/shared-types';

import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const EPISODE_STATUS = EpisodeStatusSchema.enum;

/**
 * DomainEventBridge — listens to Sally domain events that might affect
 * open Desk episodes.
 *
 * v1 scope is narrow: when `sally.invoice.paid` fires, close any open
 * AR Follow-up episodes for that invoice with outcome=invoice_paid so
 * the UI stops showing it in the Pending queue and the memory gets a
 * positive-outcome write.
 *
 * No Inngest signals yet — the Inngest function doesn't wait for
 * invoice.paid events mid-workflow today (it completes a single send +
 * closes). Future: if a responsibility wants to await domain events,
 * add `step.waitForEvent('sally/invoice.paid', {...})` and have this
 * bridge publish a matching Inngest event.
 *
 * AUTONOMY INVARIANT: this bridge today only CLOSES open episodes — it never
 * STARTS a run. If it is ever extended to start a responsibility run (i.e.
 * call `TriggerService.runByKey` off a domain event), that path is a
 * non-manual trigger and MUST first gate on
 * `DeskResponsibilityService.canRunAutonomously(tenantId, key)` — exactly
 * like the scheduler — so a domain event can't run a responsibility while
 * the tenant master switch or the per-responsibility autonomy switch is off.
 */
@Injectable()
export class DomainEventBridge {
  private readonly logger = new Logger(DomainEventBridge.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent('sally.invoice.paid')
  async onInvoicePaid(event: { tenantId: string | number; data: { invoiceNumber: string } }) {
    const tenantId = typeof event.tenantId === 'string' ? parseInt(event.tenantId, 10) : event.tenantId;
    if (!Number.isFinite(tenantId)) {
      this.logger.warn(`sally.invoice.paid — non-numeric tenantId: ${String(event.tenantId)}`);
      return;
    }

    const invoiceNumber = event.data.invoiceNumber;
    if (!invoiceNumber) {
      this.logger.debug('sally.invoice.paid — missing invoiceNumber; ignored');
      return;
    }

    // Find any open AR Follow-up episodes for this invoice in this tenant
    const openEpisodes = await this.prisma.deskEpisode.findMany({
      where: {
        tenantId,
        entityType: 'invoice',
        entityId: invoiceNumber,
        status: { in: [...OPEN_EPISODE_STATUSES] },
        responsibility: { key: 'ar_followup' },
      },
      select: { id: true, status: true },
    });

    if (openEpisodes.length === 0) return;

    // Close them with outcome=invoice_paid. Using a direct Prisma update
    // (not going through close.step) because the episode might be paused
    // waiting for human approval on a draft — we want to short-circuit
    // cleanly. Step history remains intact; the close is recorded via
    // Prisma. Memory won't be written for this path (no LLM context) —
    // that's an acceptable v1 trade.
    const now = new Date();
    await this.prisma.deskEpisode.updateMany({
      where: { id: { in: openEpisodes.map((e) => e.id) } },
      data: {
        status: EPISODE_STATUS.RESOLVED,
        outcome: DESK_OUTCOMES.INVOICE_PAID,
        outcomeNote: `Closed by sally.invoice.paid domain event (${invoiceNumber})`,
        closedAt: now,
      },
    });

    this.logger.log(
      `sally.invoice.paid — closed ${openEpisodes.length} AR Follow-up episode(s) for invoice ${invoiceNumber} (tenant ${tenantId})`,
    );
  }
}
