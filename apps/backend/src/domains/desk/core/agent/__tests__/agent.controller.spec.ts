import { readQueryDto } from '@appshore/kernel/shared/utils/query-dto';
import { fieldErrorsOf } from '@appshore/platform/test/helpers/field-errors.helpers';
import { AgentActivityWindowQueryDto } from '../dto/agent-activity-query.dto';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@appshore/db';

import { DeskAgentController } from '../agent.controller';

class FakeAgentService {
  listForTenant = jest.fn().mockResolvedValue([{ key: 'assistant' }]);
  getDetailForTenant = jest.fn().mockResolvedValue({ key: 'assistant' });
  getActivity = jest.fn().mockResolvedValue({ episodeCount: 1 });
  listEligibleSupervisors = jest.fn().mockResolvedValue({ items: [{ id: 42 }], nextCursor: null, total: 1 });
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
    expect(res).toEqual([{ key: 'assistant' }]);
  });

  it('get returns detail', async () => {
    const res = await controller.get({ role: UserRole.OWNER }, 'assistant');
    expect(agents.getDetailForTenant).toHaveBeenCalledWith(7, 'assistant');
    expect(res).toEqual({ key: 'assistant' });
  });

  it('listEligibleSupervisors delegates to service', async () => {
    const page = await controller.listEligibleSupervisors({ role: UserRole.OWNER }, { q: 'ada', limit: 10 });
    expect(agents.listEligibleSupervisors).toHaveBeenCalledWith(7, { q: 'ada', limit: 10 });
    expect(page).toEqual({ items: [{ id: 42 }], nextCursor: null, total: 1 });
  });

  describe('activity', () => {
    it('accepts a valid window', async () => {
      const res = await controller.activity(
        { role: UserRole.OWNER },
        'assistant',
        await readQueryDto(AgentActivityWindowQueryDto, { window: '7d' }),
      );
      expect(agents.getActivity).toHaveBeenCalledWith(7, 'assistant', '7d');
      expect(res.episodeCount).toBe(1);
    });

    it('defaults to 7d', async () => {
      await controller.activity(
        { role: UserRole.OWNER },
        'assistant',
        await readQueryDto(AgentActivityWindowQueryDto, {}),
      );
      expect(agents.getActivity).toHaveBeenCalledWith(7, 'assistant', '7d');
    });

    it('answers 400 naming window for an unknown one', async () => {
      expect(await fieldErrorsOf(readQueryDto(AgentActivityWindowQueryDto, { window: '1y' }))).toHaveProperty('window');
    });
  });

  describe('update', () => {
    it('allows OWNER to reassign supervisor', async () => {
      await controller.update({ role: UserRole.OWNER, dbId: 1 }, 'assistant', {
        enabled: true,
        supervisorUserId: 42,
      });
      expect(agents.updateAgent).toHaveBeenCalledWith(7, 'assistant', {
        enabled: true,
        supervisorUserId: 42,
      });
    });

    it('allows ADMIN to reassign supervisor', async () => {
      await controller.update({ role: UserRole.ADMIN, dbId: 1 }, 'assistant', { supervisorUserId: 42 });
      expect(agents.updateAgent).toHaveBeenCalled();
    });

    it('forbids MEMBER from reassigning supervisor', async () => {
      await expect(
        controller.update({ role: UserRole.MEMBER, dbId: 42 }, 'assistant', { supervisorUserId: 99 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(agents.updateAgent).not.toHaveBeenCalled();
    });

    it('allows MEMBER to toggle enabled without supervisor field', async () => {
      await controller.update({ role: UserRole.MEMBER, dbId: 42 }, 'assistant', { enabled: false });
      expect(agents.updateAgent).toHaveBeenCalledWith(7, 'assistant', {
        enabled: false,
        supervisorUserId: undefined,
      });
    });

    it('forbids MEMBER from clearing supervisor (null is a reassign)', async () => {
      await expect(
        controller.update({ role: UserRole.MEMBER, dbId: 42 }, 'assistant', { supervisorUserId: null }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
