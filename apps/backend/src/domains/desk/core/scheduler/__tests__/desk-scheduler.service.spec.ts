import { createMockPrisma } from '@appshore/platform/test/mocks/prisma.mock';

// The starter registry ships no scheduled responsibility (its one example is
// manual-trigger only), so stub the registry with a test definition carrying a
// tenant-tz cron — the heartbeat reads triggers from the registry by key.
jest.mock('../../../responsibilities', () => ({
  findResponsibilityDefinition: (key: string) => {
    if (key === 'daily_digest') {
      return {
        key: 'daily_digest',
        triggers: [{ kind: 'scheduled', cron: '0 9 * * *', tz: 'tenant' }],
      };
    }
    if (key === 'manual_only') {
      return { key: 'manual_only', triggers: [{ kind: 'manual' }] };
    }
    return undefined;
  },
}));

import { DeskSchedulerService } from '../desk-scheduler.service';

/**
 * Coverage for the heartbeat tick's gating logic. The two-switch safety
 * model is the whole point: a responsibility runs on its cron ONLY when
 * BOTH the tenant master switch (`tenant.deskScheduleEnabled`) AND the
 * per-responsibility autonomy switch (`autonomyEnabled`) are on — and only
 * on a minute its cron actually fires. The cron-window math itself is
 * unit-tested separately (cron-window.spec.ts); here we pin the gates +
 * dispatch + the best-effort isolation between rows.
 */

function makeTrigger() {
  return { runByKey: jest.fn().mockResolvedValue({ episodesOpened: 1 }) };
}

// A tick window of [09:00:00 CDT - 60s, 09:00:00 CDT) won't match "0 9 * * *";
// the matching window OPENS at 09:00 local. 09:00 CDT == 14:00:00Z, so a tick
// at 14:01:00Z gives the window [14:00:00Z, 14:01:00Z) that contains the fire.
const DUE_TICK = new Date('2026-05-22T14:01:00.000Z');
// A tick on an unrelated minute — cron never fires here.
const NOT_DUE_TICK = new Date('2026-05-22T18:30:00.000Z');

function schedRow(overrides: Record<string, unknown> = {}) {
  return {
    key: 'daily_digest', // mocked registry cron: '0 9 * * *', tz: 'tenant'
    tenantId: 10,
    tenant: { id: 10, timezone: 'America/Chicago' },
    ...overrides,
  };
}

describe('DeskSchedulerService.runHeartbeat', () => {
  it('no-ops when no tenant has the master switch on', async () => {
    const prisma = createMockPrisma();
    prisma.tenant.findMany.mockResolvedValue([]);
    const trigger = makeTrigger();
    const proc = new DeskSchedulerService(prisma, trigger as never);

    await proc.runHeartbeat(DUE_TICK);

    expect(prisma.deskResponsibility.findMany).not.toHaveBeenCalled();
    expect(trigger.runByKey).not.toHaveBeenCalled();
  });

  it('dispatches a due responsibility when both switches are on', async () => {
    const prisma = createMockPrisma();
    prisma.tenant.findMany.mockResolvedValue([{ id: 10 }]);
    prisma.deskResponsibility.findMany.mockResolvedValue([schedRow()]);
    const trigger = makeTrigger();
    const proc = new DeskSchedulerService(prisma, trigger as never);

    await proc.runHeartbeat(DUE_TICK);

    expect(trigger.runByKey).toHaveBeenCalledWith('daily_digest', 10);
  });

  it('only loads autonomy-armed, enabled, AVAILABLE rows (gating in the query)', async () => {
    const prisma = createMockPrisma();
    prisma.tenant.findMany.mockResolvedValue([{ id: 10 }]);
    prisma.deskResponsibility.findMany.mockResolvedValue([]);
    const trigger = makeTrigger();
    const proc = new DeskSchedulerService(prisma, trigger as never);

    await proc.runHeartbeat(DUE_TICK);

    const whereArg = prisma.deskResponsibility.findMany.mock.calls[0][0].where;
    expect(whereArg).toMatchObject({
      autonomyEnabled: true,
      enabled: true,
      lifecycle: 'AVAILABLE',
      tenantId: { in: [10] },
    });
  });

  it('does NOT dispatch on a minute the cron does not fire', async () => {
    const prisma = createMockPrisma();
    prisma.tenant.findMany.mockResolvedValue([{ id: 10 }]);
    prisma.deskResponsibility.findMany.mockResolvedValue([schedRow()]);
    const trigger = makeTrigger();
    const proc = new DeskSchedulerService(prisma, trigger as never);

    await proc.runHeartbeat(NOT_DUE_TICK);

    expect(trigger.runByKey).not.toHaveBeenCalled();
  });

  it('evaluates the cron in the tenant timezone (NY 9am fires an hour before Chicago 9am)', async () => {
    const prisma = createMockPrisma();
    prisma.tenant.findMany.mockResolvedValue([{ id: 11 }]);
    prisma.deskResponsibility.findMany.mockResolvedValue([
      schedRow({ tenantId: 11, tenant: { id: 11, timezone: 'America/New_York' } }),
    ]);
    const trigger = makeTrigger();
    const proc = new DeskSchedulerService(prisma, trigger as never);

    // 09:00 EDT == 13:00:00Z; the window opening at 13:00:00Z is due for NY,
    // and NOT due at the Chicago-due tick (14:01Z).
    await proc.runHeartbeat(new Date('2026-05-22T13:01:00.000Z'));
    expect(trigger.runByKey).toHaveBeenCalledWith('daily_digest', 11);

    trigger.runByKey.mockClear();
    await proc.runHeartbeat(DUE_TICK); // 14:01Z — Chicago time, not NY's 9am
    expect(trigger.runByKey).not.toHaveBeenCalled();
  });

  it('skips a row whose registry definition has no scheduled trigger', async () => {
    const prisma = createMockPrisma();
    prisma.tenant.findMany.mockResolvedValue([{ id: 10 }]);
    // A key with no scheduled trigger in the registry never matches;
    // an unknown key has no definition at all.
    prisma.deskResponsibility.findMany.mockResolvedValue([
      schedRow({ key: 'manual_only' }),
      schedRow({ key: 'totally_unknown_key' }),
    ]);
    const trigger = makeTrigger();
    const proc = new DeskSchedulerService(prisma, trigger as never);

    await proc.runHeartbeat(DUE_TICK);

    expect(trigger.runByKey).not.toHaveBeenCalled();
  });

  it('continues to other rows when one runByKey throws (best-effort)', async () => {
    const prisma = createMockPrisma();
    prisma.tenant.findMany.mockResolvedValue([{ id: 10 }, { id: 20 }]);
    prisma.deskResponsibility.findMany.mockResolvedValue([
      schedRow({ tenantId: 10, tenant: { id: 10, timezone: 'America/Chicago' } }),
      schedRow({ tenantId: 20, tenant: { id: 20, timezone: 'America/Chicago' } }),
    ]);
    const trigger = makeTrigger();
    trigger.runByKey
      .mockRejectedValueOnce(new Error('boom for tenant 10'))
      .mockResolvedValueOnce({ episodesOpened: 1 });
    const proc = new DeskSchedulerService(prisma, trigger as never);

    await expect(proc.runHeartbeat(DUE_TICK)).resolves.toBeUndefined();

    expect(trigger.runByKey).toHaveBeenCalledTimes(2);
    expect(trigger.runByKey).toHaveBeenNthCalledWith(1, 'daily_digest', 10);
    expect(trigger.runByKey).toHaveBeenNthCalledWith(2, 'daily_digest', 20);
  });

  it('evaluates a tenant-tz trigger as UTC when the tenant has no timezone', async () => {
    const prisma = createMockPrisma();
    prisma.tenant.findMany.mockResolvedValue([{ id: 10 }]);
    prisma.deskResponsibility.findMany.mockResolvedValue([schedRow({ tenant: { id: 10, timezone: null } })]);
    const trigger = makeTrigger();
    const proc = new DeskSchedulerService(prisma, trigger as never);

    // With UTC fallback, "0 9 * * *" fires at 09:00Z; window opening 09:00Z is due.
    await proc.runHeartbeat(new Date('2026-05-22T09:01:00.000Z'));
    expect(trigger.runByKey).toHaveBeenCalledWith('daily_digest', 10);
  });
});
