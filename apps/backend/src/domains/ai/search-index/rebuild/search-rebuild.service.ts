import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { SearchIndexerService } from '../indexing/search-indexer.service';
import { SEARCH_SUBJECTS, type SearchSubject } from '../search-subject';

export interface RebuildSummary {
  tenants: number;
  indexed: number;
  withoutVectors: number;
  /** Records the index held that no longer exist, or whose subject is no longer registered. */
  removed: number;
  failed: { tenantId: number; subjectType: string; subjectId: string; reason: string }[];
}

/**
 * Writes the whole index again from the records: every registered subject, every record it lists, tenant by tenant.
 * What the index holds for a record that is gone, or for a subject type that is no longer registered, is deleted.
 * Safe to run again, and safe while the app runs: each record is replaced in its own transaction.
 */
@Injectable()
export class SearchRebuildService {
  private readonly logger = new Logger(SearchRebuildService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly indexer: SearchIndexerService,
    @Inject(SEARCH_SUBJECTS) private readonly subjects: readonly SearchSubject[],
  ) {}

  async rebuild(options: { tenantIds?: readonly number[] } = {}): Promise<RebuildSummary> {
    const tenants = await this.prisma.tenant.findMany({
      where: options.tenantIds?.length ? { id: { in: [...options.tenantIds] } } : undefined,
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    const summary: RebuildSummary = { tenants: tenants.length, indexed: 0, withoutVectors: 0, removed: 0, failed: [] };
    for (const { id: tenantId } of tenants) await this.rebuildTenant(tenantId, summary);
    return summary;
  }

  private async rebuildTenant(tenantId: number, summary: RebuildSummary): Promise<void> {
    const types = this.subjects.map((s) => s.type);
    const unregistered = await this.prisma.searchChunk.deleteMany({
      where: { tenantId, subjectType: { notIn: types } },
    });
    summary.removed += unregistered.count;

    for (const subject of this.subjects) {
      const ids = [...new Set(await subject.listIds(tenantId))];
      const gone = await this.prisma.searchChunk.groupBy({
        by: ['subjectId'],
        where: { tenantId, subjectType: subject.type, subjectId: { notIn: ids } },
      });
      if (gone.length) {
        await this.prisma.searchChunk.deleteMany({
          where: { tenantId, subjectType: subject.type, subjectId: { in: gone.map((g) => g.subjectId) } },
        });
        summary.removed += gone.length;
      }
      for (const subjectId of ids) {
        try {
          const outcome = await this.indexer.reindex(tenantId, subject.type, subjectId);
          if (outcome === 'indexed') summary.indexed += 1;
          else if (outcome === 'indexed-without-vectors') summary.withoutVectors += 1;
          else if (outcome === 'removed') summary.removed += 1;
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          this.logger.warn(`Search rebuild: tenant ${tenantId} ${subject.type} ${subjectId} failed (${reason})`);
          summary.failed.push({ tenantId, subjectType: subject.type, subjectId, reason });
        }
      }
    }
  }
}
