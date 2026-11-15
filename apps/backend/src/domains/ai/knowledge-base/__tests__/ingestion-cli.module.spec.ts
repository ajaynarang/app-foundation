import { Test } from '@nestjs/testing';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { REDIS_CLIENT } from '@appshore/platform/infrastructure/cache/redis-client.provider';

import { IngestionCliModule } from '../ingestion-cli.module';
import { IngestionService } from '../ingestion.service';
import { EmbeddingService } from '../../infrastructure/providers/embedding.service';
import { AiRouteResolver } from '../../routing/ai-route-resolver.service';

/**
 * `pnpm seed:knowledge` boots this module on its own, outside the app. It could not start before: its module
 * provided `EmbeddingService` without the `AiTelemetryService` it injects (and, since embeddings moved onto the
 * resolver, without `AiRouteResolver`). This spec builds the real module graph, with only the database and Redis
 * clients replaced, and fails if a dependency is missing again.
 */
describe('IngestionCliModule', () => {
  const saved = { ...process.env };

  beforeAll(() => {
    // The config schema requires both URLs; nothing connects to them here (both clients are replaced).
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:1/none';
    process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:1';
    process.env.COHERE_API_KEY = 'co-test';
  });

  afterAll(() => {
    process.env = saved;
  });

  it('compiles, and gives the ingester an embedder on the route resolver, with the platform key from config', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [IngestionCliModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(REDIS_CLIENT)
      .useValue({})
      .compile();

    expect(moduleRef.get(IngestionService)).toBeInstanceOf(IngestionService);
    expect(moduleRef.get(EmbeddingService)).toBeInstanceOf(EmbeddingService);
    expect(moduleRef.get(AiRouteResolver).describePlatformRoutes().embedding).toBe('platform-cohere');
    await moduleRef.close();
  });

  it("does not pull in the app's event bus, whose queues cannot start outside the app", () => {
    const imports = JSON.stringify(collectModuleNames(IngestionCliModule));
    expect(imports).not.toContain('EventBusModule');
    expect(imports).not.toContain('OutboundWebhooksModule');
  });
});

/** Names of every module reachable through `imports`, statically declared. */
function collectModuleNames(root: unknown, seen = new Set<string>()): string[] {
  const imports: unknown[] = Reflect.getMetadata('imports', root) ?? [];
  for (const entry of imports) {
    const mod = (entry as { module?: unknown })?.module ?? entry;
    const name = (mod as { name?: string })?.name;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    collectModuleNames(mod, seen);
  }
  return [...seen];
}
