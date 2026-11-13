import { Test } from '@nestjs/testing';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { REDIS_CLIENT } from '@appshore/platform/infrastructure/cache/redis-client.provider';

import { KbEvalCliModule } from '../eval/kb-eval-cli.module';
import { KnowledgeBaseService } from '../knowledge-base.service';
import { AiRouteResolver } from '../../routing/ai-route-resolver.service';

/** `pnpm kb:eval` boots this module on its own; this builds its real graph with only the clients replaced. */
describe('KbEvalCliModule', () => {
  const saved = { ...process.env };

  beforeAll(() => {
    // The config schema requires both URLs; nothing connects to them here (both clients are replaced).
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:1/none';
    process.env.REDIS_URL = 'redis://localhost:1';
    process.env.COHERE_API_KEY = 'co-test';
  });

  afterAll(() => {
    process.env = saved;
  });

  it('compiles, and gives the search an embedder on the route resolver, with the platform key from config', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [KbEvalCliModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(REDIS_CLIENT)
      .useValue({})
      .compile();

    expect(moduleRef.get(KnowledgeBaseService)).toBeInstanceOf(KnowledgeBaseService);
    expect(moduleRef.get(AiRouteResolver).describePlatformRoutes().embedding).toBe('platform-cohere');
    await moduleRef.close();
  });
});
