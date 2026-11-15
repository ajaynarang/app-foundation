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
  it('enumerates the 7 known values in the expected order', () => {
    expect(LoginFailReasonSchema.options).toEqual([
      'ACCOUNT_DISABLED',
      'TENANT_INACTIVE',
      'INVALID_TOKEN',
      'INVALID_CREDENTIALS',
      'USER_NOT_FOUND',
      'REFRESH_REUSE',
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
  it('accepts a minimal query (from + to only) and leaves the page size to the service', () => {
    const parsed = ListLoginActivityQuerySchema.parse({
      from: '2026-05-19',
      to: '2026-05-26',
    });
    expect(parsed.from).toBe('2026-05-19');
    expect(parsed.to).toBe('2026-05-26');
    // The service clamps the limit (50 by default, 100 at most) and decodes the cursor.
    expect(parsed.limit).toBeUndefined();
    expect(parsed.cursor).toBeUndefined();
  });

  it('carries the cursor of the previous page and drops offset paging', () => {
    const parsed = ListLoginActivityQuerySchema.parse({
      from: '2026-05-19',
      to: '2026-05-26',
      limit: 20,
      cursor: 'opaque-cursor',
      offset: 40,
    });
    expect(parsed.cursor).toBe('opaque-cursor');
    expect(parsed.limit).toBe(20);
    expect(parsed).not.toHaveProperty('offset');
  });

  it('rejects a page size that is not an integer', () => {
    expect(() =>
      ListLoginActivityQuerySchema.parse({
        from: '2026-05-19',
        to: '2026-05-26',
        limit: 2.5,
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
      publicId: '0190f5c2-7b1e-7c3a-9a55-3f2b1c0d4e6f',
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
  it('accepts an empty page: the cursor envelope, with no next cursor', () => {
    const parsed = ListLoginActivityResponseSchema.parse({
      items: [],
      nextCursor: null,
      total: 0,
    });
    expect(parsed.items).toEqual([]);
    expect(parsed.nextCursor).toBeNull();
    expect(parsed.total).toBe(0);
  });

  it('rejects the old offset envelope, which has no nextCursor', () => {
    expect(() => ListLoginActivityResponseSchema.parse({ items: [], total: 0, limit: 50, offset: 0 })).toThrow();
  });
});
