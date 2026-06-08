import { Injectable, Logger } from '@nestjs/common';
import { LoadStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../infrastructure/cache/sally-cache.service';
import { buildKey } from '../../infrastructure/cache/cache-key.constants';
import { CACHE_TTL_HOT_30S } from '../../constants/cache.constants';
import { HomePulseDto } from './dto/home-pulse.dto';
import { RecentLoadDto } from './dto/recent-load.dto';

/** Load statuses considered operationally active */
const ACTIVE_LOAD_STATUSES: LoadStatus[] = [
  LoadStatus.PENDING,
  LoadStatus.ASSIGNED,
  LoadStatus.IN_TRANSIT,
  LoadStatus.ON_HOLD,
];

const CACHE_NS = 'sally:home';

const RECENT_LOADS_LIMIT = 5;

@Injectable()
export class HomeService {
  private readonly logger = new Logger(HomeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: SallyCacheService,
  ) {}

  /**
   * Returns operational vital signs for the dispatcher home page.
   * Uses parallel queries with 30s cache for sub-50ms responses.
   */
  async getPulse(tenantId: number): Promise<HomePulseDto> {
    return this.cache.getOrSet(
      buildKey(CACHE_NS, 'pulse', tenantId),
      () => this.computePulse(tenantId),
      CACHE_TTL_HOT_30S,
    );
  }

  /**
   * Returns the 5 most recently updated loads with minimal display fields.
   */
  async getRecentLoads(tenantId: number): Promise<RecentLoadDto[]> {
    return this.cache.getOrSet(
      buildKey(CACHE_NS, 'recent-loads', tenantId),
      () => this.queryRecentLoads(tenantId),
      CACHE_TTL_HOT_30S,
    );
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async computePulse(tenantId: number): Promise<HomePulseDto> {
    const [activeLoads, alertCount, unbilledResult] = await Promise.all([
      this.prisma.load.count({
        where: {
          tenantId,
          isActive: true,
          status: { in: ACTIVE_LOAD_STATUSES },
        },
      }),

      this.prisma.alert.count({
        where: {
          tenantId,
          status: 'ACTIVE',
        },
      }),

      this.prisma.load.aggregate({
        where: {
          tenantId,
          isActive: true,
          status: LoadStatus.DELIVERED,
          invoices: { none: {} },
        },
        _sum: { rateCents: true },
      }),
    ]);

    // TODO: wire up new Desk "needs-you" count once the agentic engine ships a
    // pending-episode endpoint. For now the home pulse reports zero pending
    // decisions — legacy agent_episodes table has been dropped.
    const pendingDecisions = 0;

    return {
      activeLoads,
      alertCount,
      pendingDecisions,
      unbilledCents: unbilledResult._sum.rateCents ?? 0,
    };
  }

  private async queryRecentLoads(tenantId: number): Promise<RecentLoadDto[]> {
    const loads = await this.prisma.load.findMany({
      where: {
        tenantId,
        isActive: true,
      },
      select: {
        loadNumber: true,
        referenceNumber: true,
        originCity: true,
        originState: true,
        destinationCity: true,
        destinationState: true,
        status: true,
        updatedAt: true,
        driver: {
          select: { name: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: RECENT_LOADS_LIMIT,
    });

    return loads.map((load) => ({
      id: load.loadNumber,
      loadNumber: load.loadNumber,
      referenceNumber: load.referenceNumber,
      originCity: load.originCity,
      originState: load.originState,
      destinationCity: load.destinationCity,
      destinationState: load.destinationState,
      status: load.status,
      driverName: load.driver?.name ?? null,
      updatedAt: load.updatedAt.toISOString(),
    }));
  }
}
