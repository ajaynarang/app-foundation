import { Test, TestingModule } from '@nestjs/testing';
import { AdminSchedulesController } from '../admin-schedules.controller';
import { ScheduleManagerService } from '@appshore/platform/infrastructure/queue/schedule-manager.service';

describe('AdminSchedulesController', () => {
  let controller: AdminSchedulesController;
  let scheduleManager: Record<string, jest.Mock>;

  const mockUser = { dbId: 1, userId: 'u-1', role: 'SUPER_ADMIN' };

  beforeEach(async () => {
    scheduleManager = {
      listSchedules: jest.fn().mockResolvedValue([]),
      updateSchedule: jest.fn().mockResolvedValue({ id: 1, updated: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminSchedulesController],
      providers: [{ provide: ScheduleManagerService, useValue: scheduleManager }],
    }).compile();

    controller = module.get<AdminSchedulesController>(AdminSchedulesController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── listSchedules ──────────────────────────────────────────────────────

  describe('listSchedules', () => {
    it('should return all schedules', async () => {
      const mockSchedules = [
        { id: 1, name: 'job-cleanup', pattern: '0 3 * * *', isEnabled: true },
        { id: 2, name: 'sync-fleet', intervalMs: 300000, isEnabled: false },
      ];
      scheduleManager.listSchedules.mockResolvedValue(mockSchedules);

      const result = await controller.listSchedules();

      expect(result).toEqual(mockSchedules);
      expect(scheduleManager.listSchedules).toHaveBeenCalled();
    });

    it('should return empty array when no schedules exist', async () => {
      scheduleManager.listSchedules.mockResolvedValue([]);

      const result = await controller.listSchedules();

      expect(result).toEqual([]);
    });
  });

  // ─── updateSchedule ─────────────────────────────────────────────────────

  describe('updateSchedule', () => {
    it('should update schedule with pattern', async () => {
      const body = { pattern: '0 6 * * *' };

      await controller.updateSchedule(1, body, mockUser);

      expect(scheduleManager.updateSchedule).toHaveBeenCalledWith(1, body, 1);
    });

    it('should update schedule with intervalMs', async () => {
      const body = { intervalMs: 60000 };

      await controller.updateSchedule(2, body, mockUser);

      expect(scheduleManager.updateSchedule).toHaveBeenCalledWith(2, body, 1);
    });

    it('should update schedule with isEnabled', async () => {
      const body = { isEnabled: false };

      await controller.updateSchedule(3, body, mockUser);

      expect(scheduleManager.updateSchedule).toHaveBeenCalledWith(3, body, 1);
    });

    it('should pass user dbId to updateSchedule', async () => {
      const userWithDifferentId = {
        dbId: 42,
        userId: 'u-42',
        role: 'SUPER_ADMIN',
      };

      await controller.updateSchedule(1, { isEnabled: true }, userWithDifferentId);

      expect(scheduleManager.updateSchedule).toHaveBeenCalledWith(1, { isEnabled: true }, 42);
    });
  });
});
