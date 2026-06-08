import { CommsBulkDriversTool } from '../comms-bulk-drivers.tool';

const DRIVER_A = {
  driverId: 'DRV-1',
  name: 'Alice',
  phone: '5550001111',
  assignedVehicleId: 'VEH-1',
};
const DRIVER_B = {
  driverId: 'DRV-2',
  name: 'Bob',
  phone: '5550002222',
  assignedVehicleId: null,
};
const USER_ROW = { id: 42 };
const CHALLENGE_ROW = {
  id: 7,
  tenantId: 1,
  principalId: 'user:42',
  toolName: 'bulk-broadcast-drivers',
  argsDigest: '', // filled per test
  consumedAt: null,
  expiresAt: new Date(Date.now() + 60_000),
};

describe('CommsBulkDriversTool', () => {
  let tool: CommsBulkDriversTool;
  let mockPrisma: {
    user: { findFirst: jest.Mock };
    driver: { findMany: jest.Mock };
    hitlChallenge: {
      create: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
  };
  let mockSms: { sendSms: jest.Mock };
  let mockCache: { increment: jest.Mock };
  let mockEvents: { emit: jest.Mock };

  beforeEach(() => {
    mockPrisma = {
      user: { findFirst: jest.fn().mockResolvedValue(USER_ROW) },
      driver: { findMany: jest.fn().mockResolvedValue([DRIVER_A, DRIVER_B]) },
      hitlChallenge: {
        create: jest.fn().mockResolvedValue({ id: 7 }),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    mockSms = { sendSms: jest.fn().mockResolvedValue(true) };
    mockCache = { increment: jest.fn().mockResolvedValue(2) };
    mockEvents = { emit: jest.fn().mockResolvedValue(undefined) };
    tool = new CommsBulkDriversTool(mockPrisma as any, mockSms as any, mockCache as any, mockEvents as any);
  });

  // ── 1. Missing _tenantId ──────────────────────────────────────────────────

  it('returns error when _tenantId is absent', async () => {
    const res = await tool.bulkBroadcastDrivers({
      filter: {},
      message: 'Hello all!',
      _tenantId: undefined,
      _userId: 'uid-1',
    });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.error).toMatch(/tenant context/);
    expect(mockSms.sendSms).not.toHaveBeenCalled();
  });

  // ── 2. Missing _userId ────────────────────────────────────────────────────

  it('returns error when _userId is absent', async () => {
    const res = await tool.bulkBroadcastDrivers({
      filter: {},
      message: 'Hello all!',
      _tenantId: 1,
      _userId: undefined,
    });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.error).toMatch(/Acting user required/);
    expect(mockSms.sendSms).not.toHaveBeenCalled();
  });

  // ── 3. Zero drivers matched ───────────────────────────────────────────────

  it('returns error when no drivers match the filter', async () => {
    mockPrisma.driver.findMany.mockResolvedValueOnce([]);
    const res = await tool.bulkBroadcastDrivers({
      filter: { status: 'active' },
      message: 'Hello!',
      _tenantId: 1,
      _userId: 'uid-1',
    });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.error).toMatch(/No drivers matched/);
    expect(mockCache.increment).not.toHaveBeenCalled();
    expect(mockSms.sendSms).not.toHaveBeenCalled();
  });

  // ── 4. Drivers matched but none have phones ───────────────────────────────

  it('returns error when no matched drivers have a phone', async () => {
    mockPrisma.driver.findMany.mockResolvedValueOnce([
      {
        driverId: 'DRV-3',
        name: 'Charlie',
        phone: null,
        assignedVehicleId: null,
      },
    ]);
    const res = await tool.bulkBroadcastDrivers({
      filter: {},
      message: 'Hello!',
      _tenantId: 1,
      _userId: 'uid-1',
    });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.error).toMatch(/phone number on file/);
    expect(mockSms.sendSms).not.toHaveBeenCalled();
  });

  // ── 5. Under threshold — sends to all ────────────────────────────────────

  it('sends to all drivers when under threshold', async () => {
    // 2 drivers, cache returns 2 total — under threshold of 10
    mockCache.increment.mockResolvedValueOnce(2);

    const res = await tool.bulkBroadcastDrivers({
      filter: {},
      message: 'Weather alert.',
      _tenantId: 1,
      _userId: 'uid-1',
    });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.sent).toBe(2);
    expect(parsed.failed).toBe(0);
    expect(mockSms.sendSms).toHaveBeenCalledTimes(2);
    expect(mockPrisma.hitlChallenge.create).not.toHaveBeenCalled();
  });

  // ── 6. Over threshold, no token → bulk_confirmation_required ─────────────

  it('returns bulk_confirmation_required when over threshold and emits HITL_CHALLENGE_ISSUED', async () => {
    mockCache.increment.mockResolvedValueOnce(11); // exceeds threshold

    const res = await tool.bulkBroadcastDrivers({
      filter: {},
      message: 'Policy update.',
      _tenantId: 1,
      _userId: 'uid-1',
    });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.status).toBe('bulk_confirmation_required');
    expect(parsed.token).toBe('7');
    expect(parsed.threshold).toBe(10);
    expect(parsed.recipientCount).toBe(2);
    expect(parsed.currentHourCount).toBe(11);
    expect(mockPrisma.hitlChallenge.create).toHaveBeenCalledTimes(1);
    expect(mockSms.sendSms).not.toHaveBeenCalled();
    expect(mockEvents.emit).toHaveBeenCalledWith(
      expect.stringContaining('hitl-challenge-issued'),
      '1',
      expect.objectContaining({
        token: '7',
        tier: 'standard',
        stepUpRequired: false,
      }),
    );
  });

  // ── 7. Valid _confirmToken → consumes and sends ───────────────────────────

  it('consumes valid token, emits HITL_CHALLENGE_COMPLETED, and sends broadcast', async () => {
    // Build the same digest the tool would compute for DRIVER_A + DRIVER_B + message
    const { createHash } = await import('crypto');
    const driverIds = [DRIVER_A.driverId, DRIVER_B.driverId].sort().join(',');
    const digest = createHash('sha256').update(driverIds).update('|').update('Go!').digest('hex');

    mockPrisma.hitlChallenge.findFirst.mockResolvedValueOnce({
      ...CHALLENGE_ROW,
      argsDigest: digest,
    });

    const res = await tool.bulkBroadcastDrivers({
      filter: {},
      message: 'Go!',
      _tenantId: 1,
      _userId: 'uid-1',
      _confirmToken: '7',
    });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.sent).toBe(2);
    expect(mockPrisma.hitlChallenge.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 7 } }));
    expect(mockSms.sendSms).toHaveBeenCalledTimes(2);
    expect(mockEvents.emit).toHaveBeenCalledWith(
      expect.stringContaining('hitl-challenge-completed'),
      '1',
      expect.objectContaining({ token: '7' }),
    );
  });

  // ── 8. Invalid _confirmToken → error ─────────────────────────────────────

  it('returns error for invalid or expired _confirmToken', async () => {
    mockPrisma.hitlChallenge.findFirst.mockResolvedValueOnce(null);

    const res = await tool.bulkBroadcastDrivers({
      filter: {},
      message: 'Go!',
      _tenantId: 1,
      _userId: 'uid-1',
      _confirmToken: 'bad-token',
    });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.error).toMatch(/invalid or expired/);
    expect(mockSms.sendSms).not.toHaveBeenCalled();
  });

  // ── 9. Third-party principal (api_key) triggers confirm at lower threshold ─

  it('third-party principal (api_key) triggers bulk_confirmation_required at threshold 5', async () => {
    // 6 recipients — over third-party threshold (5) but under first-party (10)
    mockCache.increment.mockResolvedValueOnce(6);

    const res = await tool.bulkBroadcastDrivers({
      filter: {},
      message: 'Rate update.',
      _tenantId: 1,
      _userId: 'uid-1',
      _principalKind: 'api_key',
    });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.status).toBe('bulk_confirmation_required');
    expect(parsed.threshold).toBe(5);
    expect(mockSms.sendSms).not.toHaveBeenCalled();
  });
});
