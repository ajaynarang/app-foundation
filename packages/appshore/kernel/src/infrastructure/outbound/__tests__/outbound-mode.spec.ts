import { assertOutboundSafety, OUTBOUND_MODE, resolveOutboundMode } from '../outbound-mode';

describe('resolveOutboundMode', () => {
  it('defaults to live in production', () => {
    expect(resolveOutboundMode({ ENV_TYPE: 'production' })).toBe(OUTBOUND_MODE.LIVE);
  });

  it.each(['sandbox', 'preprod', 'development', 'staging'])('defaults to allowlist with ENV_TYPE=%s', (envType) => {
    expect(resolveOutboundMode({ ENV_TYPE: envType })).toBe(OUTBOUND_MODE.ALLOWLIST);
  });

  it('defaults to allowlist when ENV_TYPE is unset (a unit test, a script)', () => {
    expect(resolveOutboundMode({})).toBe(OUTBOUND_MODE.ALLOWLIST);
  });

  it('reads production from ENV_TYPE only, never NODE_ENV', () => {
    expect(resolveOutboundMode({ ENV_TYPE: 'sandbox', NODE_ENV: 'production' })).toBe(OUTBOUND_MODE.ALLOWLIST);
  });

  it('honours an explicit value, ignoring case and spaces', () => {
    expect(resolveOutboundMode({ ENV_TYPE: 'sandbox', OUTBOUND_MODE: ' LIVE ' })).toBe(OUTBOUND_MODE.LIVE);
  });

  it('rejects an unknown value', () => {
    expect(() => resolveOutboundMode({ ENV_TYPE: 'sandbox', OUTBOUND_MODE: 'block' })).toThrow(
      /must be one of: live \| allowlist/,
    );
  });
});

describe('assertOutboundSafety', () => {
  describe('in production', () => {
    const production = { ENV_TYPE: 'production' };

    it('accepts an unset mode (live)', () => {
      expect(() => assertOutboundSafety(production)).not.toThrow();
    });

    it('accepts an explicit live mode', () => {
      expect(() => assertOutboundSafety({ ...production, OUTBOUND_MODE: 'live' })).not.toThrow();
    });

    it('refuses allowlist, which would hold back every customer message', () => {
      expect(() => assertOutboundSafety({ ...production, OUTBOUND_MODE: 'allowlist' })).toThrow(
        /production must run with OUTBOUND_MODE=live/,
      );
    });
  });

  describe.each(['sandbox', 'preprod', 'development'])('with ENV_TYPE=%s', (envType) => {
    const env = { ENV_TYPE: envType };

    it('accepts an unset mode (allowlist)', () => {
      expect(() => assertOutboundSafety(env)).not.toThrow();
    });

    it('refuses live without the acknowledgement', () => {
      expect(() => assertOutboundSafety({ ...env, OUTBOUND_MODE: 'live' })).toThrow(/live outside production/);
    });

    it('refuses live when the acknowledgement is anything but "true"', () => {
      expect(() =>
        assertOutboundSafety({ ...env, OUTBOUND_MODE: 'live', OUTBOUND_LIVE_OUTSIDE_PRODUCTION: 'yes' }),
      ).toThrow(/live outside production/);
    });

    it('accepts live with the acknowledgement (an environment that serves real people)', () => {
      expect(() =>
        assertOutboundSafety({ ...env, OUTBOUND_MODE: 'live', OUTBOUND_LIVE_OUTSIDE_PRODUCTION: 'true' }),
      ).not.toThrow();
    });
  });
});
