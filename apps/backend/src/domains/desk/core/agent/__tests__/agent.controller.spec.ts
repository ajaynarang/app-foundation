import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { DeskAgentController } from '../agent.controller';

class FakeAgentService {
  listForTenant = jest.fn().mockResolvedValue([{ key: 'sally-billing' }]);
  getDetailForTenant = jest.fn().mockResolvedValue({ key: 'sally-billing' });
  getActivity = jest.fn().mockResolvedValue({ episodeCount: 1 });
  listEligibleSupervisors = jest.fn().mockResolvedValue([{ id: 42 }]);
  updateAgent = jest.fn().mockResolvedValue({ updatedResponsibilityCount: 1, supervisorUpdated: true });
}

class FakePrisma {
  tenant = { findFirst: jest.fn().mockResolvedValue({ id: 7 }) };
}

describe('DeskAgentController', () => {
  let controller: DeskAgentController;
  let agents: FakeAgentService;

  beforeEach(() => {
    agents = new FakeAgentService();
    controller = new DeskAgentController(new FakePrisma() as any, agents as any);
    // BaseTenantController reads tenantId from user.tenantId and resolves numeric via prisma.
    (controller as any).getTenantDbId = jest.fn().mockResolvedValue(7);
  });

  it('list returns roster from service', async () => {
    const res = await controller.list({ role: UserRole.OWNER });
    expect(res).toEqual([{ key: 'sally-billing' }]);
  });

  it('get returns detail', async () => {
    const res = await controller.get({ role: UserRole.OWNER }, 'sally-billing');
    expect(agents.getDetailForTenant).toHaveBeenCalledWith(7, 'sally-billing');
    expect(res).toEqual({ key: 'sally-billing' });
  });

  it('listEligibleSupervisors delegates to service', async () => {
    await controller.listEligibleSupervisors({ role: UserRole.OWNER });
    expect(agents.listEligibleSupervisors).toHaveBeenCalledWith(7);
  });

  describe('activity', () => {
    it('accepts a valid window', async () => {
      const res = await controller.activity({ role: UserRole.OWNER }, 'sally-billing', '7d');
      expect(agents.getActivity).toHaveBeenCalledWith(7, 'sally-billing', '7d');
      expect(res.episodeCount).toBe(1);
    });

    it('defaults to 7d', async () => {
      await controller.activity({ role: UserRole.OWNER }, 'sally-billing');
      expect(agents.getActivity).toHaveBeenCalledWith(7, 'sally-billing', '7d');
    });

    it('rejects an invalid window', async () => {
      await expect(controller.activity({ role: UserRole.OWNER }, 'sally-billing', '1y')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('update', () => {
    it('allows OWNER to reassign supervisor', async () => {
      await controller.update({ role: UserRole.OWNER, dbId: 1 }, 'sally-billing', {
        enabled: true,
        supervisorUserId: 42,
      });
      expect(agents.updateAgent).toHaveBeenCalledWith(7, 'sally-billing', {
        enabled: true,
        supervisorUserId: 42,
      });
    });

    it('allows ADMIN to reassign supervisor', async () => {
      await controller.update({ role: UserRole.ADMIN, dbId: 1 }, 'sally-billing', { supervisorUserId: 42 });
      expect(agents.updateAgent).toHaveBeenCalled();
    });

    it('forbids DISPATCHER from reassigning supervisor', async () => {
      await expect(
        controller.update({ role: UserRole.DISPATCHER, dbId: 42 }, 'sally-billing', { supervisorUserId: 99 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(agents.updateAgent).not.toHaveBeenCalled();
    });

    it('allows DISPATCHER to toggle enabled without supervisor field', async () => {
      await controller.update({ role: UserRole.DISPATCHER, dbId: 42 }, 'sally-billing', { enabled: false });
      expect(agents.updateAgent).toHaveBeenCalledWith(7, 'sally-billing', {
        enabled: false,
        supervisorUserId: undefined,
      });
    });

    it('forbids DISPATCHER from clearing supervisor (null is a reassign)', async () => {
      await expect(
        controller.update({ role: UserRole.DISPATCHER, dbId: 42 }, 'sally-billing', { supervisorUserId: null }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
