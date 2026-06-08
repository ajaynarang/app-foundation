import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../infrastructure/cache/sally-cache.service';
import { buildKey } from '../../../infrastructure/cache/cache-key.constants';
import { CACHE_TTL_FROZEN_1H } from '../../../constants/cache.constants';

export interface ReferenceItem {
  code: string;
  label: string;
  sort_order: number;
  metadata: any;
}

export type ReferenceDataMap = Record<string, ReferenceItem[]>;

@Injectable()
export class ReferenceDataService {
  private readonly logger = new Logger(ReferenceDataService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: SallyCacheService,
  ) {}

  async getByCategories(categories?: string[]): Promise<ReferenceDataMap> {
    const allData = await this.getAllCached();

    if (!categories || categories.length === 0) {
      return allData;
    }

    const filtered: ReferenceDataMap = {};
    for (const cat of categories) {
      if (allData[cat]) {
        filtered[cat] = allData[cat];
      }
    }
    return filtered;
  }

  private async getAllCached(): Promise<ReferenceDataMap> {
    return this.cache.getOrSet<ReferenceDataMap>(
      buildKey('sally:reference', 'data'),
      async () => {
        this.logger.log('Refreshing reference data cache');

        const rows = await this.prisma.referenceData.findMany({
          where: { isActive: true },
          orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
        });

        const grouped: ReferenceDataMap = {};
        for (const row of rows) {
          if (!grouped[row.category]) {
            grouped[row.category] = [];
          }
          grouped[row.category].push({
            code: row.code,
            label: row.label,
            sort_order: row.sortOrder,
            metadata: row.metadata || {},
          });
        }

        return grouped;
      },
      CACHE_TTL_FROZEN_1H,
    );
  }
}
