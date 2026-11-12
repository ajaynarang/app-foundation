import { Injectable, Logger } from '@nestjs/common';
import { AiSurface, Prisma } from '@appshore/db';

import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { EmbeddingService } from '../../../../ai/infrastructure/providers/embedding.service';
import { AiCredentialFailing } from '../../../../ai/routing/ai-credential-failing.error';
import { AiNotConfigured } from '../../../../ai/routing/ai-not-configured.error';
import { ZeroRetentionUnavailable } from '../../../../ai/infrastructure/redaction/zero-retention-unavailable.error';

export interface ReembedTenantOutcome {
  tenantId: number;
  /** The error's name for a routing refusal; `Name: message` for any other failure. */
  reason: string;
}

export interface ReembedSummary {
  /** Tenants that had at least one memory without a vector when the run started. */
  tenants: number;
  /** Memories that got a vector in this run. */
  reembedded: number;
  /** Tenants their route refused (zero retention with no zero-retention route, no route, a failing credential). */
  skipped: ReembedTenantOutcome[];
  /** Tenants that stopped on any other error. What was embedded before the error is kept. */
  failed: ReembedTenantOutcome[];
}

/** Refusals that are the tenant's routing state, not a fault: the run skips that tenant and says why. */
const ROUTING_REFUSALS = [ZeroRetentionUnavailable, AiNotConfigured, AiCredentialFailing];

/**
 * Re-embeds Desk memories that have no vector: after the embedding model changed (old vectors were cleared, because
 * vectors from two models cannot be compared), or after a memory was written while no embedding route served its
 * tenant.
 *
 * Tenant by tenant, through each tenant's own route (`EmbeddingService.embedBatch`), so the right payer and the
 * tenant's retention policy apply, and each batch lands one ledger row. Rows are paged by id and only a vector that
 * is still null is filled, so it is safe to re-run and never overwrites a memory written meanwhile. One tenant's
 * refusal or failure never stops the others.
 */
@Injectable()
export class DeskMemoryReembedService {
  private readonly logger = new Logger(DeskMemoryReembedService.name);

  /** Memories per embedding call (one ledger row each). */
  batchSize = 64;

  constructor(
    private readonly prisma: PrismaService,
    private readonly embedder: EmbeddingService,
  ) {}

  async reembedAll(): Promise<ReembedSummary> {
    const tenants = await this.prisma.$queryRaw<{ tenant_id: number }[]>`
      SELECT DISTINCT tenant_id FROM desk_memories WHERE content_embedding IS NULL ORDER BY tenant_id
    `;
    const summary: ReembedSummary = { tenants: tenants.length, reembedded: 0, skipped: [], failed: [] };

    for (const { tenant_id: tenantId } of tenants) {
      const progress = { count: 0 };
      try {
        await this.reembedTenant(tenantId, progress);
      } catch (err) {
        const refusal = ROUTING_REFUSALS.find((type) => err instanceof type);
        if (refusal) {
          summary.skipped.push({ tenantId, reason: refusal.name });
          this.logger.warn(`Tenant ${tenantId} skipped: its route refused (${refusal.name})`);
        } else {
          const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
          summary.failed.push({ tenantId, reason });
          this.logger.error(`Tenant ${tenantId} stopped after ${progress.count} memories: ${reason}`);
        }
      }
      summary.reembedded += progress.count;
    }
    return summary;
  }

  private async reembedTenant(tenantId: number, progress: { count: number }): Promise<void> {
    let cursor: string | null = null;
    for (;;) {
      const page: { id: string; content: string }[] = await this.prisma.$queryRaw(Prisma.sql`
        SELECT id, content FROM desk_memories
        WHERE tenant_id = ${tenantId} AND content_embedding IS NULL
        ${cursor ? Prisma.sql`AND id > ${cursor}::uuid` : Prisma.empty}
        ORDER BY id
        LIMIT ${this.batchSize}
      `);
      if (page.length === 0) return;

      const vectors = await this.embedder.embedBatch(
        page.map((row) => row.content),
        { tenantId, surface: AiSurface.EMBEDDING },
        'document',
      );
      for (let i = 0; i < page.length; i++) {
        const updated = await this.prisma.$executeRaw`
          UPDATE desk_memories SET content_embedding = ${`[${vectors[i].join(',')}]`}::vector
          WHERE id = ${page[i].id}::uuid AND content_embedding IS NULL
        `;
        progress.count += updated;
      }
      cursor = page[page.length - 1].id;
    }
  }
}
