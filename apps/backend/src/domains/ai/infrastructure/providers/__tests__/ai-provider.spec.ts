jest.mock('ai', () => ({
  customProvider: jest.fn().mockReturnValue({
    languageModel: jest.fn().mockReturnValue('mock-language-model'),
    embeddingModel: jest.fn().mockReturnValue('mock-embedding-model'),
  }),
  createGateway: jest.fn().mockReturnValue(
    Object.assign(jest.fn().mockReturnValue('gateway-model'), {
      embeddingModel: jest.fn().mockReturnValue('gateway-embedding'),
    }),
  ),
  wrapLanguageModel: jest.fn(({ model }) => model),
}));
jest.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: jest.fn().mockReturnValue(jest.fn().mockReturnValue('anthropic-model')),
}));

// Clear cached providers before each test
beforeEach(() => {
  jest.resetModules();
});

describe('ai-provider', () => {
  beforeEach(() => {
    delete process.env.AI_PROVIDER;
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('exports ai function', async () => {
    const mod = await import('../ai-provider');
    expect(typeof mod.ai).toBe('function');
  });

  it('exports aiEmbedding function', async () => {
    const mod = await import('../ai-provider');
    expect(typeof mod.aiEmbedding).toBe('function');
  });

  it('exports getRequiredAiEnvVar', async () => {
    const mod = await import('../ai-provider');
    expect(mod.getRequiredAiEnvVar()).toBe('AI_GATEWAY_API_KEY');
  });

  it('returns ANTHROPIC_API_KEY when provider is anthropic', async () => {
    process.env.AI_PROVIDER = 'anthropic';
    const mod = await import('../ai-provider');
    expect(mod.getRequiredAiEnvVar()).toBe('ANTHROPIC_API_KEY');
  });

  it('isAiConfigured returns false when key is missing', async () => {
    const mod = await import('../ai-provider');
    expect(mod.isAiConfigured()).toBe(false);
  });

  it('isAiConfigured returns true when key is set', async () => {
    process.env.AI_GATEWAY_API_KEY = 'test_key';
    const mod = await import('../ai-provider');
    expect(mod.isAiConfigured()).toBe(true);
  });

  it('isAiConfigured returns true when ANTHROPIC_API_KEY set for anthropic provider', async () => {
    process.env.AI_PROVIDER = 'anthropic';
    process.env.ANTHROPIC_API_KEY = 'test_anthropic_key';
    const mod = await import('../ai-provider');
    expect(mod.isAiConfigured()).toBe(true);
  });

  it('exports aiDirect function', async () => {
    const mod = await import('../ai-provider');
    expect(typeof mod.aiDirect).toBe('function');
  });

  it('aiDirect returns a model', async () => {
    process.env.ANTHROPIC_API_KEY = 'test_key';
    const mod = await import('../ai-provider');
    const model = mod.aiDirect('fast');
    expect(model).toBeDefined();
  });

  it('ai function returns a model', async () => {
    process.env.AI_GATEWAY_API_KEY = 'test_key';
    const mod = await import('../ai-provider');
    const model = mod.ai('fast');
    expect(model).toBeDefined();
  });

  it('aiEmbedding returns an embedding model', async () => {
    process.env.AI_GATEWAY_API_KEY = 'test_key';
    const mod = await import('../ai-provider');
    const model = mod.aiEmbedding('embedding');
    expect(model).toBeDefined();
  });

  it('ai uses anthropic provider when AI_PROVIDER=anthropic', async () => {
    process.env.AI_PROVIDER = 'anthropic';
    process.env.ANTHROPIC_API_KEY = 'test_key';
    const mod = await import('../ai-provider');
    const model = mod.ai('standard');
    expect(model).toBeDefined();
  });
});
