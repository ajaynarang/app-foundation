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
    model: config.model,
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

import { InternalServerErrorException } from '@nestjs/common';
import { RequestContext } from '@mastra/core/request-context';
import { Agent } from '@mastra/core/agent';
import { Observability } from '@mastra/observability';
import { MastraProvider } from '../mastra.provider';
import { PiiMaskingSpanOutputProcessor } from '../../../infrastructure/telemetry/pii-masking-span-output-processor';
import { REQUEST_MODEL_KEY } from '../../../routing/request-model-key';

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

    it('masks phones and emails in every agent span before the Langfuse exporter sees it', async () => {
      process.env.LANGFUSE_SECRET_KEY = 'sk_test';
      process.env.LANGFUSE_PUBLIC_KEY = 'pk_test';
      (Observability as unknown as jest.Mock).mockClear();

      await new MastraProvider().onModuleInit();

      const [[{ configs }]] = (Observability as unknown as jest.Mock).mock.calls;
      expect(configs.langfuse.spanOutputProcessors).toEqual([expect.any(PiiMaskingSpanOutputProcessor)]);
    });
  });

  describe('per-request model', () => {
    /** The `model` each registered agent was constructed with. */
    function registeredModels(): Array<(arg: { requestContext: RequestContext }) => unknown> {
      return (Agent as unknown as jest.Mock).mock.calls.map(([config]) => config.model);
    }

    beforeEach(() => (Agent as unknown as jest.Mock).mockClear());

    it('gives every agent the model the call site resolved for the tenant, never a default provider', async () => {
      await provider.onModuleInit();
      const resolved = { modelId: 'resolved-model' };
      const models = registeredModels();
      expect(models.length).toBeGreaterThan(0);
      for (const model of models) {
        expect(typeof model).toBe('function');
        expect(model({ requestContext: new RequestContext([[REQUEST_MODEL_KEY, resolved]] as never) })).toBe(resolved);
      }
    });

    it('fails loud when an agent is invoked without a resolved model', async () => {
      await provider.onModuleInit();
      for (const model of registeredModels()) {
        expect(() => model({ requestContext: new RequestContext() })).toThrow(InternalServerErrorException);
      }
    });
  });
});
