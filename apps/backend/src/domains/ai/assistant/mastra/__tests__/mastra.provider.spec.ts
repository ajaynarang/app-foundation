jest.mock('@mastra/core', () => ({
  Mastra: jest.fn().mockImplementation(() => ({
    getAgent: jest.fn().mockReturnValue({}),
    shutdown: jest.fn().mockResolvedValue(undefined),
  })),
}));
jest.mock('@mastra/core/agent', () => ({
  Agent: jest.fn().mockImplementation((config: any) => ({
    id: config.id,
    name: config.name,
  })),
}));
jest.mock('@mastra/pg', () => ({
  PostgresStore: jest.fn().mockImplementation(() => ({
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));
jest.mock('@mastra/memory', () => ({
  Memory: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('@mastra/observability', () => ({
  Observability: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('@mastra/langfuse', () => ({
  LangfuseExporter: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../../infrastructure/providers/ai-provider', () => ({
  ai: jest.fn().mockReturnValue('mock-model'),
}));

import { MastraProvider } from '../mastra.provider';

describe('MastraProvider', () => {
  let provider: MastraProvider;

  beforeEach(() => {
    process.env.DATABASE_URL = 'postgres://localhost:5432/test';
    provider = new MastraProvider();
  });

  afterEach(() => {
    delete process.env.DATABASE_URL;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_PUBLIC_KEY;
  });

  describe('onModuleInit', () => {
    it('initializes Mastra with agents', async () => {
      await provider.onModuleInit();
      expect(provider.getMastra()).toBeDefined();
    });
  });

  describe('getMastra', () => {
    it('throws when not initialized', () => {
      const fresh = new MastraProvider();
      expect(() => fresh.getMastra()).toThrow('Mastra not initialized');
    });

    it('returns Mastra instance after init', async () => {
      await provider.onModuleInit();
      const mastra = provider.getMastra();
      expect(mastra).toBeDefined();
    });
  });

  describe('onModuleDestroy', () => {
    it('shuts down Mastra and closes store', async () => {
      await provider.onModuleInit();
      await expect(provider.onModuleDestroy()).resolves.not.toThrow();
    });
  });

  describe('with LangFuse observability', () => {
    it('initializes observability when keys present', async () => {
      process.env.LANGFUSE_SECRET_KEY = 'sk_test';
      process.env.LANGFUSE_PUBLIC_KEY = 'pk_test';

      const providerWithLF = new MastraProvider();
      await providerWithLF.onModuleInit();
      expect(providerWithLF.getMastra()).toBeDefined();
    });
  });
});
