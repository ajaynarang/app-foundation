import { Logger, NotFoundException } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Job } from 'bullmq';
import { VENDOR_DATA_JOB_NAMES } from '../../../../infrastructure/queue/queue.constants';
import type { QueueJobHandler } from '../../../../infrastructure/queue/job-handler.contract';
import { VendorCircuitBreakerService } from '../../../../infrastructure/queue/vendor-circuit-breaker.service';
import { DomainEvent } from '../../../../infrastructure/events/domain-event';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';
import { LoadBoardService } from '../load-board.service';
import { SavedSearchService } from './saved-search.service';
import type { LoadBoardSearchParams } from '@sally/shared-types';

const LOAD_BOARD_VENDOR = 'dat';

/**
 * Owns `load-board-poll` (DAT polling) on the `vendor-data` queue. A plain
 * handler — the single VendorDataQueueProcessor dispatcher routes by name.
 *
 * Circuit breaker: the inner per-search loop already swallows individual
 * failures, so we record a vendor failure only when the entire sweep blows up
 * before any search has been polled. Per-search NotFoundException (DAT
 * disconnected for a single tenant) is not a vendor outage — don't trip on it.
 */
@Injectable()
export class SavedSearchJobHandler implements QueueJobHandler {
  readonly jobNames = [VENDOR_DATA_JOB_NAMES.LOAD_BOARD_POLL];
  private readonly logger = new Logger(SavedSearchJobHandler.name);

  constructor(
    private readonly savedSearchService: SavedSearchService,
    private readonly loadBoardService: LoadBoardService,
    private readonly eventEmitter: EventEmitter2,
    private readonly circuitBreaker: VendorCircuitBreakerService,
  ) {}

  async run(_job: Job): Promise<void> {
    if (await this.circuitBreaker.isOpen(LOAD_BOARD_VENDOR)) {
      throw new Error('Vendor circuit open for dat — deferring saved-search poll');
    }

    try {
      await this.runPollCycle();
      await this.circuitBreaker.recordSuccess(LOAD_BOARD_VENDOR);
    } catch (err) {
      await this.circuitBreaker.recordFailure(LOAD_BOARD_VENDOR);
      throw err;
    }
  }

  private async runPollCycle(): Promise<void> {
    this.logger.log('Starting saved search polling cycle');

    const activeSearches = await this.savedSearchService.findAllActive();

    if (activeSearches.length === 0) {
      this.logger.debug('No active saved searches to poll');
      return;
    }

    this.logger.log(`Polling ${activeSearches.length} active saved searches`);

    for (const search of activeSearches) {
      try {
        await this.pollSingleSearch(search);
      } catch (error) {
        // If DAT integration was disconnected, don't spam logs
        if (error instanceof NotFoundException) {
          this.logger.warn(
            `Skipping saved search "${search.name}" — DAT integration not active for tenant ${search.tenantId}`,
          );
          continue;
        }
        this.logger.error(
          `Failed to poll saved search ${search.savedSearchId}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    this.logger.log('Saved search polling cycle complete');
  }

  private async pollSingleSearch(search: any): Promise<void> {
    const params = search.searchParams as unknown as LoadBoardSearchParams;

    const result = await this.loadBoardService.search(search.tenantId, params);

    // Apply optional min rate filter (compares per-mile rate)
    const filteredListings = search.minRate
      ? result.listings.filter((l) => l.ratePerMile >= search.minRate)
      : result.listings;

    const currentIds = filteredListings.map((l) => l.externalId);
    const previousIds = new Set<string>(search.lastSeenIds || []);

    // Find genuinely new listings (not seen in previous poll)
    const newIds = currentIds.filter((id) => !previousIds.has(id));

    if (newIds.length > 0) {
      const newListings = filteredListings.filter((l) => newIds.includes(l.externalId));
      const userId = search.user?.userId;

      if (userId) {
        this.eventEmitter.emit(
          SALLY_EVENTS.LOAD_BOARD_ALERT_FIRED,
          new DomainEvent(SALLY_EVENTS.LOAD_BOARD_ALERT_FIRED, String(search.tenantId), {
            savedSearchId: search.savedSearchId,
            name: search.name,
            newCount: newIds.length,
            topListings: newListings.slice(0, 3).map((l) => ({
              externalId: l.externalId,
              origin: `${l.origin.city}, ${l.origin.state}`,
              destination: `${l.destination.city}, ${l.destination.state}`,
              rate: l.rate,
              ratePerMile: l.ratePerMile,
            })),
            recipientUserIds: [userId],
          }),
        );

        this.logger.log(`Notified user ${userId} — ${newIds.length} new loads for "${search.name}"`);
      }
    }

    await this.savedSearchService.updatePolled(search.id, currentIds.length, currentIds);
  }
}
