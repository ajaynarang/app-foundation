import { Test } from '@nestjs/testing';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { REDIS_CLIENT } from '@appshore/platform/infrastructure/cache/redis-client.provider';

import { ReembedDeskMemoryCliModule } from '../reembed-desk-memory-cli.module';
import { DeskMemoryReembedService } from '../desk-memory-reembed.service';
import { formatReembedSummary, parseTenantIds } from '../reembed-desk-memory.command';

/**
 * `pnpm ai:reembed-desk-memory` boots this module on its own, outside the app. This builds the real module graph,
 * with only the database and Redis clients replaced, and fails if a dependency is missing.
 */
describe('ReembedDeskMemoryCliModule', () => {
  const saved = { ...process.env };

  beforeAll(() => {
    // The config schema requires both URLs; nothing connects to them here (both clients are replaced).
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:1/none';
    process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:1';
  });

  afterAll(() => {
    process.env = saved;
  });

  it('compiles and provides the re-embed service', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ReembedDeskMemoryCliModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(REDIS_CLIENT)
      .useValue({})
      .compile();

    expect(moduleRef.get(DeskMemoryReembedService)).toBeInstanceOf(DeskMemoryReembedService);
    await moduleRef.close();
  });

  it('names every skipped and failed tenant in the summary', () => {
    const text = formatReembedSummary({
      tenants: 3,
      reembedded: 4,
      skipped: [{ tenantId: 1, reason: 'ZeroRetentionUnavailable' }],
      failed: [{ tenantId: 2, reason: 'Error: provider down' }],
    });
    expect(text).toContain('Memories embedded: 4');
    expect(text).toContain('Skipped tenant 1: its route refused (ZeroRetentionUnavailable)');
    expect(text).toContain('Failed tenant 2: Error: provider down');
  });

  it('reads --tenant ids, and refuses one that is not a number', () => {
    expect(parseTenantIds([])).toBeUndefined();
    expect(parseTenantIds(['--tenant', '4', '--tenant', '9'])).toEqual([4, 9]);
    expect(() => parseTenantIds(['--tenant', 'acme'])).toThrow('numeric tenant id');
  });
});
