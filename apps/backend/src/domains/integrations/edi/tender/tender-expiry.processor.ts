import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EDITenderResponse } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { VENDOR_DATA_JOB_NAMES } from '../../../../infrastructure/queue/queue.constants';
import type { QueueJobHandler } from '../../../../infrastructure/queue/job-handler.contract';
import { VendorCircuitBreakerService } from '../../../../infrastructure/queue/vendor-circuit-breaker.service';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';

const EDI_VENDOR = 'edi';

/**
 * Owns `edi-tender-expiry` on the `vendor-data` queue. A plain handler — the
 * single VendorDataQueueProcessor dispatcher routes by name. Circuit breaker:
 * tender expiry fires events to trading-partner subscribers that eventually call
 * EDI, so we treat `edi` as one vendor to avoid stacking expiries during outage.
 */
@Injectable()
export class TenderExpiryJobHandler implements QueueJobHandler {
  readonly jobNames = [VENDOR_DATA_JOB_NAMES.EDI_TENDER_EXPIRY];
  private readonly logger = new Logger(TenderExpiryJobHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventService,
    private readonly circuitBreaker: VendorCircuitBreakerService,
  ) {}

  async run(_job: Job): Promise<any> {
    if (await this.circuitBreaker.isOpen(EDI_VENDOR)) {
      throw new Error('Vendor circuit open for edi — deferring tender expiry sweep');
    }

    try {
      const result = await this.checkExpiredTenders();
      await this.circuitBreaker.recordSuccess(EDI_VENDOR);
      return result;
    } catch (err) {
      await this.circuitBreaker.recordFailure(EDI_VENDOR);
      throw err;
    }
  }

  private async checkExpiredTenders() {
    const now = new Date();

    // Find all loads in 'tender' status with expired deadlines
    const expiredLoads = await this.prisma.load.findMany({
      where: {
        status: 'TENDER',
        tenderExpiresAt: { lt: now, not: null },
        tenderResponse: null,
      },
      include: {
        ediTenderMessage: { include: { tradingPartner: true } },
      },
    });

    if (expiredLoads.length === 0) return { expired: 0 };

    this.logger.log(`Found ${expiredLoads.length} expired tender(s)`);

    let expired = 0;
    for (const load of expiredLoads) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.load.update({
            where: { id: load.id },
            data: {
              status: 'CANCELLED',
              tenderResponse: EDITenderResponse.EXPIRED,
              cancelledAt: now,
            },
          });

          if (load.ediTenderId) {
            await tx.eDIMessage.update({
              where: { id: load.ediTenderId },
              data: { status: 'EXPIRED', respondedAt: now },
            });
          }
        });

        await this.events.emit(SALLY_EVENTS.EDI_TENDER_EXPIRED, load.tenantId, {
          entityId: String(load.id),
          entityType: 'edi-tender',
          loadId: load.id,
          partnerId: load.ediTenderMessage?.tradingPartner?.id,
          partnerName: load.ediTenderMessage?.tradingPartner?.name,
          expiresAt: load.tenderExpiresAt?.toISOString(),
        });

        expired++;
      } catch (error: any) {
        this.logger.error(`Failed to expire tender for load ${load.id}: ${error.message}`);
      }
    }

    this.logger.log(`Expired ${expired} tender(s)`);
    return { expired };
  }
}
