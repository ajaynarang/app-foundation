import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SALLY_EVENTS } from '../../../infrastructure/events/sally-events.constants';
import { DomainEvent } from '../../../infrastructure/events/domain-event';
import { TripService } from './trip.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

@Injectable()
export class TripStatusListener {
  private readonly logger = new Logger(TripStatusListener.name);

  constructor(
    private readonly tripService: TripService,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent(SALLY_EVENTS.LOAD_STATUS_CHANGED)
  async handleLoadStatusChanged(event: DomainEvent<{ loadNumber: string; status: string }>) {
    try {
      const load = await this.prisma.load.findFirst({
        where: { loadNumber: event.data.loadNumber },
        select: { tripId: true },
      });

      if (load?.tripId) {
        await this.tripService.syncTripStatusFromLoads(load.tripId);
      }
    } catch (error) {
      this.logger.error(
        `Failed to sync trip status after load status change: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }
}
