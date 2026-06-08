import { UserRole } from '@prisma/client';

import { DeskScheduleController } from '../desk-schedule.controller';

class FakeScheduleService {
  getState = jest.fn().mockResolvedValue({ enabled: false });
  setState = jest.fn().mockResolvedValue({ enabled: true });
}

class FakePrisma {
  tenant = { findFirst: jest.fn().mockResolvedValue({ id: 7 }) };
}

describe('DeskScheduleController', () => {
  let controller: DeskScheduleController;
  let schedule: FakeScheduleService;

  beforeEach(() => {
    schedule = new FakeScheduleService();
    controller = new DeskScheduleController(new FakePrisma() as any, schedule as any);
    (controller as any).getTenantDbId = jest.fn().mockResolvedValue(7);
  });

  it('get returns the master-switch state for the tenant', async () => {
    const res = await controller.get({ role: UserRole.DISPATCHER });
    expect(schedule.getState).toHaveBeenCalledWith(7);
    expect(res).toEqual({ enabled: false });
  });

  it('update arms the master switch', async () => {
    const res = await controller.update({ role: UserRole.ADMIN }, { enabled: true });
    expect(schedule.setState).toHaveBeenCalledWith(7, true);
    expect(res).toEqual({ enabled: true });
  });

  it('update can pause all autonomous runs', async () => {
    schedule.setState.mockResolvedValue({ enabled: false });
    const res = await controller.update({ role: UserRole.OWNER }, { enabled: false });
    expect(schedule.setState).toHaveBeenCalledWith(7, false);
    expect(res).toEqual({ enabled: false });
  });
});
