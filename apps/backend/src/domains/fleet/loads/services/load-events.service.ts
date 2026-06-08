import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

@Injectable()
export class LoadEventsService {
  private readonly logger = new Logger(LoadEventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async logEvent(params: {
    loadId: number;
    eventType: string;
    fromValue?: string;
    toValue?: string;
    description?: string;
    userId?: number;
    metadata?: any;
  }) {
    return this.prisma.loadEvent.create({
      data: {
        loadId: params.loadId,
        eventType: params.eventType,
        fromValue: params.fromValue,
        toValue: params.toValue,
        description: params.description,
        userId: params.userId,
        metadata: params.metadata,
      },
    });
  }

  async getEvents(loadId: number, limit = 50, offset = 0) {
    return this.prisma.loadEvent.findMany({
      where: { loadId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
  }
}
