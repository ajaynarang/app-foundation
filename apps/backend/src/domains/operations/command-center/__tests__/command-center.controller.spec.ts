import { Test } from '@nestjs/testing';
import { CommandCenterController } from '../command-center.controller';
import { CommandCenterService } from '../command-center.service';
import { ActiveLoadsService } from '../services/active-loads.service';
import { RiskScoreService } from '../services/risk-score.service';
import { TowerWireService } from '../services/tower-wire.service';

describe('CommandCenterController', () => {
  let controller: CommandCenterController;
  let ccService: any;
  let activeLoadsService: any;
  let riskScoreService: any;
  let towerWireService: any;

  const mockUser = { tenantDbId: 1, userId: 'u-1' };

  beforeEach(async () => {
    ccService = {
      getMapData: jest.fn().mockResolvedValue({ drivers: [] }),
      getOverview: jest.fn().mockResolvedValue({ kpis: {} }),
      getMessageSummary: jest.fn().mockResolvedValue([]),
      getSystemHealth: jest.fn().mockResolvedValue({ status: 'ok' }),
      getShiftNotes: jest.fn().mockResolvedValue([]),
      createShiftNote: jest.fn().mockResolvedValue({ id: 1 }),
      acknowledgeHandoff: jest.fn().mockResolvedValue(undefined),
      togglePinShiftNote: jest.fn().mockResolvedValue({ pinned: true }),
      deleteShiftNote: jest.fn().mockResolvedValue(undefined),
    };

    activeLoadsService = {
      findActiveLoads: jest.fn().mockResolvedValue([]),
    };
    riskScoreService = {
      computeScores: jest.fn().mockResolvedValue([]),
    };
    towerWireService = {
      backfill: jest.fn().mockResolvedValue([]),
    };

    const module = await Test.createTestingModule({
      controllers: [CommandCenterController],
      providers: [
        { provide: CommandCenterService, useValue: ccService },
        { provide: ActiveLoadsService, useValue: activeLoadsService },
        { provide: RiskScoreService, useValue: riskScoreService },
        { provide: TowerWireService, useValue: towerWireService },
      ],
    }).compile();

    controller = module.get(CommandCenterController);
  });

  it('should get map data', async () => {
    const result = await controller.getMapData(mockUser);
    expect(ccService.getMapData).toHaveBeenCalledWith(1);
    expect(result).toEqual({ drivers: [] });
  });

  it('should get overview', async () => {
    await controller.getOverview(mockUser);
    expect(ccService.getOverview).toHaveBeenCalledWith(1);
  });

  it('should get message summary', async () => {
    await controller.getMessageSummary(mockUser);
    expect(ccService.getMessageSummary).toHaveBeenCalledWith(1);
  });

  it('should get system health', async () => {
    await controller.getSystemHealth(mockUser);
    expect(ccService.getSystemHealth).toHaveBeenCalledWith(1);
  });

  it('should get shift notes', async () => {
    await controller.getShiftNotes(mockUser);
    expect(ccService.getShiftNotes).toHaveBeenCalledWith(1);
  });

  it('should create shift note', async () => {
    await controller.createShiftNote(mockUser, {
      content: 'test',
      isPinned: false,
      priority: 'normal',
    });
    expect(ccService.createShiftNote).toHaveBeenCalledWith(1, 'u-1', 'test', false, 'normal');
  });

  it('should acknowledge handoff', async () => {
    const result = await controller.acknowledgeHandoff(mockUser);
    expect(result).toEqual({ message: 'Handoff acknowledged' });
  });

  it('should toggle pin', async () => {
    await controller.togglePinShiftNote(mockUser, 'note-1');
    expect(ccService.togglePinShiftNote).toHaveBeenCalledWith(1, 'note-1');
  });

  it('should delete shift note', async () => {
    const result = await controller.deleteShiftNote(mockUser, 'note-1');
    expect(result).toEqual({ message: 'Note deleted' });
  });

  describe('Tower v3 endpoints', () => {
    it('GET /active-loads forwards lookaheadHours and tenant', async () => {
      activeLoadsService.findActiveLoads.mockResolvedValueOnce([{ loadId: 'LD-1' }]);

      const result = await controller.getActiveLoads(mockUser, { lookaheadHours: 4 });

      expect(activeLoadsService.findActiveLoads).toHaveBeenCalledWith(1, 4);
      expect(result).toEqual([{ loadId: 'LD-1' }]);
    });

    it('GET /risk-scores chains active-loads → risk-score', async () => {
      activeLoadsService.findActiveLoads.mockResolvedValueOnce([{ loadId: 'LD-1' }]);
      riskScoreService.computeScores.mockResolvedValueOnce([
        { loadId: 'LD-1', driverId: 'DRV-1', score: 80, band: 'critical' },
      ]);

      const result = await controller.getRiskScores(mockUser, { lookaheadHours: 8 });

      expect(activeLoadsService.findActiveLoads).toHaveBeenCalledWith(1, 8);
      expect(riskScoreService.computeScores).toHaveBeenCalledWith(1, [{ loadId: 'LD-1' }]);
      expect(result).toHaveLength(1);
    });

    it('GET /wire uses defaults when query is empty', async () => {
      await controller.getWire(mockUser, { limit: 50, since: undefined, kinds: undefined });

      const args = towerWireService.backfill.mock.calls[0];
      expect(args[0]).toBe(1);
      expect(args[1]).toBeInstanceOf(Date);
      expect(args[2]).toEqual(['alert', 'message', 'desk', 'ops']);
      expect(args[3]).toBe(50);
    });

    it('GET /wire forwards explicit since + kinds', async () => {
      const since = '2026-05-15T11:00:00.000Z';
      await controller.getWire(mockUser, {
        limit: 10,
        since,
        kinds: ['alert', 'desk'],
      });

      const args = towerWireService.backfill.mock.calls[0];
      expect(args[0]).toBe(1);
      expect(args[1].toISOString()).toBe(since);
      expect(args[2]).toEqual(['alert', 'desk']);
      expect(args[3]).toBe(10);
    });
  });
});
