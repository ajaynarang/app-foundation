import { NotFoundException } from '@nestjs/common';

import { createMockPrisma } from '@appshore/platform/test/mocks/prisma.mock';

import { DeskScheduleService } from '../desk-schedule.service';

/**
 * Coverage for the tenant master-switch read/write. The switch defaults
 * OFF; flipping it on is what arms every per-responsibility schedule for the
 * tenant. Manual "Run now" never reads this flag.
 */
describe('DeskScheduleService', () => {
  describe('getState', () => {
    it('returns the tenant master-switch value with timezone', async () => {
      const prisma = createMockPrisma();
      prisma.tenant.findUnique.mockResolvedValue({ deskScheduleEnabled: true, timezone: 'America/Chicago' });
      const svc = new DeskScheduleService(prisma);

      await expect(svc.getState(10)).resolves.toEqual({ enabled: true, timezone: 'America/Chicago' });
    });

    it('falls back to the default timezone when the tenant has none', async () => {
      const prisma = createMockPrisma();
      prisma.tenant.findUnique.mockResolvedValue({ deskScheduleEnabled: false, timezone: null });
      const svc = new DeskScheduleService(prisma);

      await expect(svc.getState(10)).resolves.toEqual({ enabled: false, timezone: 'UTC' });
    });

    it('throws NotFound when the tenant is missing', async () => {
      const prisma = createMockPrisma();
      prisma.tenant.findUnique.mockResolvedValue(null);
      const svc = new DeskScheduleService(prisma);

      await expect(svc.getState(999)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('setState', () => {
    it('persists the new value and returns it with timezone', async () => {
      const prisma = createMockPrisma();
      prisma.tenant.update.mockResolvedValue({ deskScheduleEnabled: true, timezone: 'America/Chicago' });
      const svc = new DeskScheduleService(prisma);

      const result = await svc.setState(10, true);

      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { deskScheduleEnabled: true },
        select: { deskScheduleEnabled: true, timezone: true },
      });
      expect(result).toEqual({ enabled: true, timezone: 'America/Chicago' });
    });

    it('can pause all autonomous runs (sets false)', async () => {
      const prisma = createMockPrisma();
      prisma.tenant.update.mockResolvedValue({ deskScheduleEnabled: false, timezone: 'UTC' });
      const svc = new DeskScheduleService(prisma);

      await expect(svc.setState(10, false)).resolves.toEqual({ enabled: false, timezone: 'UTC' });
    });
  });
});
