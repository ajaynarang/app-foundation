/**
 * The CSP names the error tracker's ingest origin only when a DSN is set, and derives it from the DSN host rather
 * than hard-coding one Sentry region.
 */
async function connectSrc(dsn: string | undefined): Promise<string> {
  const saved = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (dsn === undefined) delete process.env.NEXT_PUBLIC_SENTRY_DSN;
  else process.env.NEXT_PUBLIC_SENTRY_DSN = dsn;
  try {
    let config: { headers: () => Promise<{ headers: { key: string; value: string }[] }[]> } | undefined;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      config = require('../../../../next.config').default;
    });
    const [rule] = await config!.headers();
    const csp = rule.headers.find((h) => h.key === 'Content-Security-Policy')!.value;
    return csp.split('; ').find((d) => d.startsWith('connect-src'))!;
  } finally {
    if (saved === undefined) delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    else process.env.NEXT_PUBLIC_SENTRY_DSN = saved;
  }
}

describe('CSP connect-src and the Sentry ingest origin', () => {
  beforeAll(() => jest.spyOn(console, 'log').mockImplementation(() => undefined));

  it('names no Sentry origin without a DSN', async () => {
    expect(await connectSrc(undefined)).not.toMatch(/sentry/);
  });

  it('adds the origin of the DSN host when one is set', async () => {
    expect(await connectSrc('https://key@o123.ingest.de.sentry.io/456')).toContain(' https://o123.ingest.de.sentry.io');
  });

  it('ignores a malformed DSN', async () => {
    expect(await connectSrc('not a url')).not.toMatch(/sentry|not a url/);
  });
});
