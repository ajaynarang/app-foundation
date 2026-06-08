import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';
import { DomainEvent } from '../../../../infrastructure/events/domain-event';
import { NoaService } from './noa.service';

interface TenantFactoringDefaultChangedPayload {
  previousFactoringCompanyId: number | null;
  newFactoringCompanyId: number | null;
  changedBy: string;
}

/**
 * When a tenant ★-pins a new default factor (Phase 1), every customer that
 * has been factored in the last 6 months needs a fresh NOT_SENT NoaRecord
 * for the new factor. This subscriber kicks off that bulk upsert so the
 * dispatcher can immediately see — and batch-send — the new NOAs from the
 * inbox.
 *
 * Failure here logs a warning but never re-throws: event handlers must
 * not crash the bus. Worst case the dispatcher creates the NOAs manually
 * from the inbox.
 */
@Injectable()
export class NoaFactorChangeSubscriber {
  private readonly logger = new Logger(NoaFactorChangeSubscriber.name);

  constructor(private readonly noaService: NoaService) {}

  @OnEvent(SALLY_EVENTS.TENANT_FACTORING_DEFAULT_CHANGED, { async: true })
  async onTenantFactoringDefaultChanged(event: DomainEvent<TenantFactoringDefaultChangedPayload>): Promise<void> {
    const { newFactoringCompanyId } = event.data;
    if (newFactoringCompanyId == null) {
      // Unpin (factor removed) — nothing to bulk-create.
      return;
    }

    const tenantId = Number(event.tenantId);
    if (!Number.isFinite(tenantId)) {
      this.logger.warn(`NoaFactorChangeSubscriber: invalid tenantId on event: ${event.tenantId}`);
      return;
    }

    try {
      const result = await this.noaService.bulkCreateForFactorChange(tenantId, newFactoringCompanyId);
      this.logger.log(
        `NoaFactorChangeSubscriber: tenantId=${tenantId} factorId=${newFactoringCompanyId} created=${result.created} skipped=${result.skipped}`,
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `NoaFactorChangeSubscriber: bulk create failed for tenantId=${tenantId} factorId=${newFactoringCompanyId}: ${reason}`,
      );
    }
  }
}
