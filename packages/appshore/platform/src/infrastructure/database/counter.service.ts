import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Atomic counter service using Postgres UPSERT + RETURNING.
 *
 * Guarantees unique sequential values even under concurrent access
 * (e.g. 3 BullMQ workers creating loads simultaneously).
 *
 * Uses ON CONFLICT ... DO UPDATE SET value = value + 1 RETURNING value
 * which is atomic in a single SQL statement — no locks, no retries.
 *
 * Key format convention: "{entity}:{scope}" e.g. "load:2026-02-17"
 * The date in the key gives you daily-resetting sequences automatically.
 */
@Injectable()
export class CounterService {
  private readonly logger = new Logger(CounterService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Atomically increment a counter and return the new value.
   * Creates the counter row on first use (starts at 1).
   */
  async nextValue(tenantId: number, key: string): Promise<number> {
    const result = await this.prisma.$queryRaw<[{ value: number }]>`
      INSERT INTO tenant_counters (tenant_id, key, value, updated_at)
      VALUES (${tenantId}, ${key}, 1, NOW())
      ON CONFLICT (tenant_id, key)
      DO UPDATE SET value = tenant_counters.value + 1, updated_at = NOW()
      RETURNING value
    `;
    return result[0].value;
  }

  /**
   * Get the current value without incrementing. Returns 0 if counter doesn't exist.
   */
  async currentValue(tenantId: number, key: string): Promise<number> {
    const counter = await this.prisma.tenantCounter.findUnique({
      where: { tenantId_key: { tenantId, key } },
    });
    return counter?.value ?? 0;
  }
}
