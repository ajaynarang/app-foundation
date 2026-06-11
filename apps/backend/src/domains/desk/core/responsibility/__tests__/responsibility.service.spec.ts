import { BadRequestException, NotFoundException } from '@nestjs/common';

import { createMockPrisma } from '../../../../../test/mocks/prisma.mock';

import { DeskResponsibilityService } from '../responsibility.service';

/**
 * Coverage for the per-responsibility autonomy switch, the surfacing of
 * `autonomyEnabled` on the list/detail read shapes, and the shared
 * `canRunAutonomously` guard. The switch is off-by-default and can't be set
 * on a COMING_SOON responsibility. The guard is the canonical "may this run
 * on its own?" check every non-manual trigger path must consult.
 */
describe('DeskResponsibilityService — autonomy switch', () => {
  // The starter registry's one shipped AVAILABLE responsibility.
  const AVAILABLE_KEY = 'welcome';

  function detailRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 101,
      key: AVAILABLE_KEY,
      lifecycle: 'AVAILABLE',
      enabled: true,
      autonomyEnabled: false,
      trustLevel: 'SUPERVISED',
      conditions: {},
      lastRunAt: null,
      ...overrides,
    };
  }

  describe('setAutonomyEnabled', () => {
    it('flips the row and returns the refreshed detail', async () => {
      const prisma = createMockPrisma();
      // findUnique #1 = lifecycle lookup; #2 = getForTenant re-read
      prisma.deskResponsibility.findUnique
        .mockResolvedValueOnce({ id: 101, lifecycle: 'AVAILABLE' })
        .mockResolvedValueOnce(detailRow({ autonomyEnabled: true }));
      prisma.deskEpisode.count.mockResolvedValue(0);
      prisma.deskApproval.count.mockResolvedValue(0);
      const svc = new DeskResponsibilityService(prisma);

      const result = await svc.setAutonomyEnabled(7, AVAILABLE_KEY, true);

      expect(prisma.deskResponsibility.update).toHaveBeenCalledWith({
        where: { id: 101 },
        data: { autonomyEnabled: true },
      });
      expect(result.autonomyEnabled).toBe(true);
    });

    it('throws NotFound when the responsibility is not seeded', async () => {
      const prisma = createMockPrisma();
      prisma.deskResponsibility.findUnique.mockResolvedValue(null);
      const svc = new DeskResponsibilityService(prisma);

      await expect(svc.setAutonomyEnabled(7, AVAILABLE_KEY, true)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.deskResponsibility.update).not.toHaveBeenCalled();
    });

    it('throws NotFound for an unknown responsibility key', async () => {
      const prisma = createMockPrisma();
      const svc = new DeskResponsibilityService(prisma);

      await expect(svc.setAutonomyEnabled(7, 'no_such_key', true)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.deskResponsibility.findUnique).not.toHaveBeenCalled();
    });

    it('refuses to arm a COMING_SOON responsibility', async () => {
      const prisma = createMockPrisma();
      prisma.deskResponsibility.findUnique.mockResolvedValue({ id: 101, lifecycle: 'COMING_SOON' });
      const svc = new DeskResponsibilityService(prisma);

      await expect(svc.setAutonomyEnabled(7, AVAILABLE_KEY, true)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.deskResponsibility.update).not.toHaveBeenCalled();
    });
  });

  describe('getForTenant surfaces autonomyEnabled', () => {
    it('returns the persisted autonomyEnabled value', async () => {
      const prisma = createMockPrisma();
      prisma.deskResponsibility.findUnique.mockResolvedValue(detailRow({ autonomyEnabled: true }));
      prisma.deskEpisode.count.mockResolvedValue(0);
      prisma.deskApproval.count.mockResolvedValue(0);
      const svc = new DeskResponsibilityService(prisma);

      const detail = await svc.getForTenant(7, AVAILABLE_KEY);

      expect(detail.autonomyEnabled).toBe(true);
    });
  });

  describe('listForTenant surfaces autonomyEnabled', () => {
    it('defaults autonomyEnabled to false for a responsibility with no row', async () => {
      const prisma = createMockPrisma();
      prisma.deskResponsibility.findMany.mockResolvedValue([]); // no seeded rows
      prisma.deskEpisode.groupBy.mockResolvedValue([]);
      prisma.deskApproval.findMany.mockResolvedValue([]);
      const svc = new DeskResponsibilityService(prisma);

      const list = await svc.listForTenant(7);

      expect(list.length).toBeGreaterThan(0);
      expect(list.every((r) => r.autonomyEnabled === false)).toBe(true);
    });

    it('reflects a seeded row’s autonomyEnabled', async () => {
      const prisma = createMockPrisma();
      prisma.deskResponsibility.findMany.mockResolvedValue([
        {
          id: 101,
          key: AVAILABLE_KEY,
          lifecycle: 'AVAILABLE',
          enabled: true,
          autonomyEnabled: true,
          trustLevel: 'SUPERVISED',
          lastRunAt: null,
        },
      ]);
      prisma.deskEpisode.groupBy.mockResolvedValue([]);
      prisma.deskApproval.findMany.mockResolvedValue([]);
      const svc = new DeskResponsibilityService(prisma);

      const list = await svc.listForTenant(7);
      const row = list.find((r) => r.key === AVAILABLE_KEY);

      expect(row?.autonomyEnabled).toBe(true);
    });
  });

  /**
   * The single canonical guard for "may this responsibility run on its own?".
   * Every non-manual trigger path (scheduler today; domain-event / webhook
   * later) MUST gate on this before dispatching a run. It is true ONLY when
   * ALL four gates align: tenant master on, responsibility enabled, autonomy
   * armed, and lifecycle AVAILABLE. Manual "Run now" never consults it.
   */
  describe('canRunAutonomously', () => {
    const FULLY_ARMED = {
      enabled: true,
      autonomyEnabled: true,
      lifecycle: 'AVAILABLE' as const,
    };

    function armed(prisma: ReturnType<typeof createMockPrisma>, resp: Record<string, unknown> | null) {
      prisma.tenant.findUnique.mockResolvedValue({ deskScheduleEnabled: true });
      prisma.deskResponsibility.findUnique.mockResolvedValue(resp);
    }

    it('returns true when all four gates are on', async () => {
      const prisma = createMockPrisma();
      armed(prisma, FULLY_ARMED);
      const svc = new DeskResponsibilityService(prisma);

      await expect(svc.canRunAutonomously(7, AVAILABLE_KEY)).resolves.toBe(true);
    });

    it('returns false when the tenant master switch is off', async () => {
      const prisma = createMockPrisma();
      prisma.tenant.findUnique.mockResolvedValue({ deskScheduleEnabled: false });
      prisma.deskResponsibility.findUnique.mockResolvedValue(FULLY_ARMED);
      const svc = new DeskResponsibilityService(prisma);

      await expect(svc.canRunAutonomously(7, AVAILABLE_KEY)).resolves.toBe(false);
    });

    it('returns false when the responsibility is disabled', async () => {
      const prisma = createMockPrisma();
      armed(prisma, { ...FULLY_ARMED, enabled: false });
      const svc = new DeskResponsibilityService(prisma);

      await expect(svc.canRunAutonomously(7, AVAILABLE_KEY)).resolves.toBe(false);
    });

    it('returns false when autonomy is not armed', async () => {
      const prisma = createMockPrisma();
      armed(prisma, { ...FULLY_ARMED, autonomyEnabled: false });
      const svc = new DeskResponsibilityService(prisma);

      await expect(svc.canRunAutonomously(7, AVAILABLE_KEY)).resolves.toBe(false);
    });

    it('returns false when the responsibility is not AVAILABLE', async () => {
      const prisma = createMockPrisma();
      armed(prisma, { ...FULLY_ARMED, lifecycle: 'COMING_SOON' });
      const svc = new DeskResponsibilityService(prisma);

      await expect(svc.canRunAutonomously(7, AVAILABLE_KEY)).resolves.toBe(false);
    });

    it('returns false when the tenant does not exist', async () => {
      const prisma = createMockPrisma();
      prisma.tenant.findUnique.mockResolvedValue(null);
      prisma.deskResponsibility.findUnique.mockResolvedValue(FULLY_ARMED);
      const svc = new DeskResponsibilityService(prisma);

      await expect(svc.canRunAutonomously(7, AVAILABLE_KEY)).resolves.toBe(false);
    });

    it('returns false when the responsibility is not seeded', async () => {
      const prisma = createMockPrisma();
      armed(prisma, null);
      const svc = new DeskResponsibilityService(prisma);

      await expect(svc.canRunAutonomously(7, AVAILABLE_KEY)).resolves.toBe(false);
    });
  });
});
