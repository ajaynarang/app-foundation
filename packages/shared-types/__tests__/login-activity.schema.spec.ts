import {
  LoginFailReasonSchema,
  LoginEventStatusSchema,
  LoginActivityEventSchema,
  ListLoginActivityQuerySchema,
  LoginActivitySummaryQuerySchema,
  LoginActivitySummarySchema,
  ListLoginActivityResponseSchema,
} from '../src/platform/login-activity.schema';

describe('LoginFailReasonSchema', () => {
  it('enumerates the 6 known values in the expected order', () => {
    expect(LoginFailReasonSchema.options).toEqual([
      'ACCOUNT_DISABLED',
      'TENANT_INACTIVE',
      'INVALID_TOKEN',
      'INVALID_CREDENTIALS',
      'USER_NOT_FOUND',
      'OTHER',
    ]);
  });
});

describe('LoginEventStatusSchema', () => {
  it('enumerates SUCCESS, FAILED, LOGOUT in that order', () => {
    expect(LoginEventStatusSchema.options).toEqual(['SUCCESS', 'FAILED', 'LOGOUT']);
  });
});

describe('ListLoginActivityQuerySchema', () => {
  it('accepts a minimal query (from + to only) and applies limit/offset defaults', () => {
    const parsed = ListLoginActivityQuerySchema.parse({
      from: '2026-05-19',
      to: '2026-05-26',
    });
    expect(parsed.from).toBe('2026-05-19');
    expect(parsed.to).toBe('2026-05-26');
    expect(parsed.limit).toBe(50);
    expect(parsed.offset).toBe(0);
  });

  it('rejects limit > 100', () => {
    expect(() =>
      ListLoginActivityQuerySchema.parse({
        from: '2026-05-19',
        to: '2026-05-26',
        limit: 101,
      }),
    ).toThrow();
  });
});

describe('LoginActivitySummaryQuerySchema', () => {
  it('picks from/to/tenantId/roles from the list query', () => {
    const parsed = LoginActivitySummaryQuerySchema.parse({
      from: '2026-05-19',
      to: '2026-05-26',
      tenantId: 7,
      roles: ['ADMIN'],
    });
    expect(parsed.tenantId).toBe(7);
    expect(parsed.roles).toEqual(['ADMIN']);
  });
});

describe('LoginActivitySummarySchema', () => {
  it('accepts the empty-result KPI + notable shape', () => {
    const parsed = LoginActivitySummarySchema.parse({
      kpis: {
        totalSignIns: 0,
        failedAttempts: 0,
        failedDeltaPct: 0,
        uniqueUsers: 0,
        uniqueIps: 0,
      },
      notable: { bruteForceSuspects: [], newIpSignIns: [], offHoursSignIns: [] },
      timezoneUsed: 'UTC',
    });
    expect(parsed.kpis.totalSignIns).toBe(0);
    expect(parsed.notable.bruteForceSuspects).toEqual([]);
    expect(parsed.timezoneUsed).toBe('UTC');
  });
});

describe('LoginActivityEventSchema', () => {
  it('rejects an empty object (requires id + status)', () => {
    expect(() => LoginActivityEventSchema.parse({})).toThrow();
  });

  it('round-trips a fully-populated event including failReason and tenant', () => {
    const input = {
      id: 42,
      createdAt: '2026-05-26T12:34:56.000Z',
      status: 'FAILED' as const,
      ip: '203.0.113.7',
      userAgent: 'Mozilla/5.0',
      deviceLabel: 'MacBook Pro',
      deviceId: 'dev-abc',
      sessionId: 'sess-xyz',
      failReason: 'INVALID_TOKEN' as const,
      user: {
        id: 9,
        email: 'member@example.com',
        firstName: 'Mike',
        lastName: 'Reyes',
        role: 'MEMBER',
      },
      tenant: { id: 3, name: 'Acme Inc' },
    };
    const parsed = LoginActivityEventSchema.parse(input);
    expect(parsed).toEqual(input);
  });
});

describe('ListLoginActivityResponseSchema', () => {
  it('accepts an empty page', () => {
    const parsed = ListLoginActivityResponseSchema.parse({
      items: [],
      total: 0,
      limit: 50,
      offset: 0,
    });
    expect(parsed.items).toEqual([]);
    expect(parsed.total).toBe(0);
  });
});
