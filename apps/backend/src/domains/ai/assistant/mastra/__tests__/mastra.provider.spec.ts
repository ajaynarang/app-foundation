// Like the real Mastra 1.x: shutdown() closes the storage it was given.
jest.mock('@mastra/core', () => ({
  Mastra: jest.fn().mockImplementation((config: { storage?: { close(): Promise<void> } }) => ({
    getAgent: jest.fn().mockReturnValue({}),
    shutdown: jest.fn(async () => {
      await config.storage?.close();
    }),
  })),
}));
jest.mock('@mastra/core/agent', () => ({
  Agent: jest.fn().mockImplementation((config: any) => ({
    id: config.id,
    name: config.name,
    model: config.model,
  })),
}));
// Like the real PostgresStore: close() ends its pg pool, and pg refuses to end a pool twice.
jest.mock('@mastra/pg', () => ({
  PostgresStore: jest.fn().mockImplementation(() => {
    let ended = false;
    return {
      close: jest.fn(async () => {
        if (ended) throw new Error('Called end on pool more than once');
        ended = true;
      }),
    };
  }),
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
import { Mastra } from '@mastra/core';
import { PostgresStore } from '@mastra/pg';
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
    it('shuts down Mastra, which closes the store, and does not end the pool a second time', async () => {
      await provider.onModuleInit();
      await expect(provider.onModuleDestroy()).resolves.toBeUndefined();

      const store = (PostgresStore as unknown as jest.Mock).mock.results.at(-1)?.value;
      expect(store.close).toHaveBeenCalledTimes(1);
    });

    it('is safe to call twice', async () => {
      await provider.onModuleInit();
      await provider.onModuleDestroy();
      await expect(provider.onModuleDestroy()).resolves.toBeUndefined();
    });

    it('closes the store itself when Mastra was never created', async () => {
      (Mastra as unknown as jest.Mock).mockImplementationOnce(() => {
        throw new Error('bad config');
      });
      await expect(provider.onModuleInit()).rejects.toThrow('bad config');
      jest.spyOn((provider as any).logger, 'error').mockImplementation(() => undefined);

      await expect(provider.onModuleDestroy()).resolves.toBeUndefined();

      const store = (PostgresStore as unknown as jest.Mock).mock.results.at(-1)?.value;
      expect(store.close).toHaveBeenCalledTimes(1);
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
