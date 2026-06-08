describe('CORS production warning logic', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  function shouldWarn(nodeEnv: string, corsOrigins: string): boolean {
    return nodeEnv === 'production' && corsOrigins.split(',').some((o) => o.trim().includes('localhost'));
  }

  it('warns when NODE_ENV=production and CORS includes localhost', () => {
    expect(shouldWarn('production', 'http://localhost:3000')).toBe(true);
  });

  it('does not warn in development', () => {
    expect(shouldWarn('development', 'http://localhost:3000')).toBe(false);
  });

  it('does not warn in production with production origin', () => {
    expect(shouldWarn('production', 'https://app.example.com')).toBe(false);
  });

  it('warns if one of multiple origins is localhost in production', () => {
    expect(shouldWarn('production', 'https://app.example.com,http://localhost:3000')).toBe(true);
  });

  it('does not warn when no env set', () => {
    expect(shouldWarn('test', 'http://localhost:3000')).toBe(false);
  });
});
