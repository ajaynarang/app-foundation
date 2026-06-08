import { Test, TestingModule } from '@nestjs/testing';
import { HOSRuleEngineService, HOSState } from '../hos-rule-engine.service';

function freshState(overrides?: Partial<HOSState>): HOSState {
  return {
    hoursDriven: 0,
    onDutyTime: 0,
    hoursSinceBreak: 0,
    drivingHoursSinceBreak: 0,
    cycleHoursUsed: 0,
    cycleDaysData: [],
    ...overrides,
  };
}

describe('HOSRuleEngineService', () => {
  let service: HOSRuleEngineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HOSRuleEngineService],
    }).compile();

    service = module.get<HOSRuleEngineService>(HOSRuleEngineService);
  });

  // ─── 11-hour driving limit ───────────────────────────────────────────────

  describe('11-hour driving limit', () => {
    it('should be compliant when within limit', () => {
      const result = service.validateCompliance(freshState({ hoursDriven: 5 }));
      const driveCheck = result.checks.find((c) => c.rule === '11-hour driving limit');

      expect(driveCheck.isCompliant).toBe(true);
      expect(driveCheck.remaining).toBe(6);
      expect(driveCheck.warningLevel).toBe('ok');
    });

    it('should be compliant exactly at limit', () => {
      const result = service.validateCompliance(freshState({ hoursDriven: 11 }));
      const driveCheck = result.checks.find((c) => c.rule === '11-hour driving limit');

      expect(driveCheck.isCompliant).toBe(true);
      expect(driveCheck.remaining).toBe(0);
      expect(driveCheck.warningLevel).toBe('violation');
    });

    it('should be non-compliant when over limit', () => {
      const result = service.validateCompliance(freshState({ hoursDriven: 11.5 }));
      const driveCheck = result.checks.find((c) => c.rule === '11-hour driving limit');

      expect(driveCheck.isCompliant).toBe(false);
      expect(driveCheck.remaining).toBe(0);
      expect(driveCheck.warningLevel).toBe('violation');
    });

    it('should warn when between 75-90% of limit', () => {
      const result = service.validateCompliance(freshState({ hoursDriven: 9 })); // 9/11 = 81.8%
      const driveCheck = result.checks.find((c) => c.rule === '11-hour driving limit');

      expect(driveCheck.warningLevel).toBe('warning');
    });

    it('should be critical when between 90-100% of limit', () => {
      const result = service.validateCompliance(freshState({ hoursDriven: 10.5 })); // 10.5/11 = 95.5%
      const driveCheck = result.checks.find((c) => c.rule === '11-hour driving limit');

      expect(driveCheck.warningLevel).toBe('critical');
    });
  });

  // ─── 14-hour duty window ─────────────────────────────────────────────────

  describe('14-hour duty window', () => {
    it('should be compliant when within limit', () => {
      const result = service.validateCompliance(freshState({ onDutyTime: 10 }));
      const dutyCheck = result.checks.find((c) => c.rule === '14-hour duty window');

      expect(dutyCheck.isCompliant).toBe(true);
      expect(dutyCheck.remaining).toBe(4);
    });

    it('should be non-compliant when exceeded', () => {
      const result = service.validateCompliance(freshState({ onDutyTime: 15 }));
      const dutyCheck = result.checks.find((c) => c.rule === '14-hour duty window');

      expect(dutyCheck.isCompliant).toBe(false);
      expect(dutyCheck.remaining).toBe(0);
    });
  });

  // ─── 30-minute break requirement (FMCSA §395.3(a)(3)(ii) — DRIVING time) ──
  //
  // The 30-minute break is required after 8 cumulative hours of DRIVING time
  // without a 30-minute interruption — NOT after 8 hours of on-duty time.
  // The engine therefore gates the break on `drivingHoursSinceBreak`.

  describe('30-minute break requirement', () => {
    it('should be compliant when driving recently interrupted by a break', () => {
      const result = service.validateCompliance(freshState({ drivingHoursSinceBreak: 2 }));
      const breakCheck = result.checks.find((c) => c.rule.includes('30-minute break'));

      expect(breakCheck.isCompliant).toBe(true);
      expect(breakCheck.remaining).toBe(6);
    });

    it('should be non-compliant when 8h of driving exceeded', () => {
      const result = service.validateCompliance(freshState({ drivingHoursSinceBreak: 9 }));
      const breakCheck = result.checks.find((c) => c.rule.includes('30-minute break'));

      expect(breakCheck.isCompliant).toBe(false);
      expect(breakCheck.remaining).toBe(0);
    });

    it('should be compliant exactly at the 8h driving trigger', () => {
      const result = service.validateCompliance(freshState({ drivingHoursSinceBreak: 8 }));
      const breakCheck = result.checks.find((c) => c.rule.includes('30-minute break'));

      expect(breakCheck.isCompliant).toBe(true);
      expect(breakCheck.remaining).toBe(0);
    });

    // The defining FMCSA distinction: on-duty (non-driving) time does NOT
    // count toward the 8h break trigger. A driver who loads at a dock for 4h
    // then drives 4h is at 4h DRIVING — no break required yet.
    it('should NOT require a break for 4h dock + 4h driving (only 4h driving)', () => {
      const afterDock = service.simulateAfterDriving(freshState(), 0, 4); // 4h on-duty, 0 driving
      const afterDrive = service.simulateAfterDriving(afterDock, 4, 4); // +4h driving

      expect(afterDrive.drivingHoursSinceBreak).toBe(4);
      const breakCheck = service.validateCompliance(afterDrive).checks.find((c) => c.rule.includes('30-minute break'));
      expect(breakCheck.isCompliant).toBe(true);
      expect(breakCheck.remaining).toBe(4);
    });

    it('should require a break after 8h of pure driving', () => {
      const afterDrive = service.simulateAfterDriving(freshState(), 8, 8);

      expect(afterDrive.drivingHoursSinceBreak).toBe(8);
      const breakCheck = service.validateCompliance(afterDrive).checks.find((c) => c.rule.includes('30-minute break'));
      expect(breakCheck.remaining).toBe(0);
    });
  });

  // ─── 70-hour/8-day cycle ─────────────────────────────────────────────────

  describe('70-hour/8-day cycle limit', () => {
    it('should be compliant when within cycle', () => {
      const result = service.validateCompliance(freshState({ cycleHoursUsed: 50 }));
      const cycleCheck = result.checks.find((c) => c.rule.includes('70-hour'));

      expect(cycleCheck.isCompliant).toBe(true);
      expect(cycleCheck.remaining).toBe(20);
    });

    it('should be non-compliant when cycle exceeded', () => {
      const result = service.validateCompliance(freshState({ cycleHoursUsed: 71 }));
      const cycleCheck = result.checks.find((c) => c.rule.includes('70-hour'));

      expect(cycleCheck.isCompliant).toBe(false);
      expect(cycleCheck.remaining).toBe(0);
    });

    it('should require restart when cycle hours exhausted', () => {
      const result = service.validateCompliance(freshState({ cycleHoursUsed: 70 }));

      expect(result.needsRestart).toBe(true);
      expect(result.cycleHoursRemaining).toBe(0);
    });
  });

  // ─── canDrive ────────────────────────────────────────────────────────────

  describe('canDrive', () => {
    it('should return true when all limits clear', () => {
      expect(service.canDrive(freshState())).toBe(true);
    });

    it('should return false when drive hours at limit', () => {
      expect(service.canDrive(freshState({ hoursDriven: 11 }))).toBe(false);
    });

    it('should return false when duty window exceeded', () => {
      expect(service.canDrive(freshState({ onDutyTime: 14 }))).toBe(false);
    });

    it('should return false when break overdue (8h driving)', () => {
      expect(service.canDrive(freshState({ drivingHoursSinceBreak: 8 }))).toBe(false);
    });

    it('should return true at 8h on-duty but only 3h driving (break not yet due)', () => {
      expect(service.canDrive(freshState({ hoursSinceBreak: 8, drivingHoursSinceBreak: 3 }))).toBe(true);
    });

    it('should return false when cycle exhausted', () => {
      expect(service.canDrive(freshState({ cycleHoursUsed: 70 }))).toBe(false);
    });
  });

  // ─── hoursUntilRestRequired ──────────────────────────────────────────────

  describe('hoursUntilRestRequired', () => {
    it('should return the minimum of all remaining allowances', () => {
      const state = freshState({
        hoursDriven: 5, // 6 remaining
        onDutyTime: 10, // 4 remaining
        drivingHoursSinceBreak: 6, // 2 remaining (break is tightest)
        cycleHoursUsed: 50, // 20 remaining
      });

      expect(service.hoursUntilRestRequired(state)).toBe(2);
    });

    it('should return 0 when any limit is already reached', () => {
      const state = freshState({ hoursDriven: 11 });
      expect(service.hoursUntilRestRequired(state)).toBe(0);
    });

    it('should handle fresh driver (all at 0)', () => {
      expect(service.hoursUntilRestRequired(freshState())).toBe(8); // break trigger is tightest
    });
  });

  // ─── simulateAfterDriving ────────────────────────────────────────────────

  describe('simulateAfterDriving', () => {
    it('should add drive and on-duty hours correctly', () => {
      const state = freshState({ hoursDriven: 3, onDutyTime: 5 });
      const after = service.simulateAfterDriving(state, 2, 2.5);

      expect(after.hoursDriven).toBe(5);
      expect(after.onDutyTime).toBe(7.5);
      expect(after.hoursSinceBreak).toBe(2.5);
      expect(after.cycleHoursUsed).toBe(2.5);
    });

    it('should advance drivingHoursSinceBreak by driveHours only', () => {
      const state = freshState({ drivingHoursSinceBreak: 3 });
      const after = service.simulateAfterDriving(state, 2, 4); // 2h driving within 4h on-duty

      expect(after.drivingHoursSinceBreak).toBe(5); // +2 driving, NOT +4 on-duty
    });

    it('should NOT advance drivingHoursSinceBreak for on-duty-only time (e.g. loading)', () => {
      const state = freshState({ drivingHoursSinceBreak: 3 });
      const after = service.simulateAfterDriving(state, 0, 2); // 2h on-duty, 0 driving

      expect(after.drivingHoursSinceBreak).toBe(3); // unchanged
      expect(after.hoursSinceBreak).toBe(2); // on-duty-since-break still advances
    });

    it('should clamp onDutyHours to at least driveHours', () => {
      const after = service.simulateAfterDriving(freshState(), 5, 3);

      expect(after.hoursDriven).toBe(5);
      expect(after.onDutyTime).toBe(5); // clamped to driveHours
    });

    it('should add today to cycleDaysData', () => {
      const after = service.simulateAfterDriving(freshState(), 3, 3);
      const today = new Date().toISOString().split('T')[0];

      expect(after.cycleDaysData).toEqual(
        expect.arrayContaining([expect.objectContaining({ date: today, hoursWorked: 3 })]),
      );
    });
  });

  // ─── simulateAfterFullRest ───────────────────────────────────────────────

  describe('simulateAfterFullRest', () => {
    it('should reset daily clocks but preserve cycle', () => {
      const state = freshState({
        hoursDriven: 10,
        onDutyTime: 13,
        hoursSinceBreak: 7,
        drivingHoursSinceBreak: 7,
        cycleHoursUsed: 45,
      });
      const after = service.simulateAfterFullRest(state);

      expect(after.hoursDriven).toBe(0);
      expect(after.onDutyTime).toBe(0);
      expect(after.hoursSinceBreak).toBe(0);
      expect(after.drivingHoursSinceBreak).toBe(0);
      expect(after.cycleHoursUsed).toBe(45); // cycle NOT reset
    });

    it('should clear split rest state', () => {
      const state = freshState({
        splitRestState: {
          inSplit: true,
          firstPortionType: 'sleeper_7',
          firstPortionCompleted: true,
          pausedDutyWindow: 6,
        },
      });
      const after = service.simulateAfterFullRest(state);

      expect(after.splitRestState).toBeUndefined();
    });
  });

  // ─── simulateAfter34hRestart ─────────────────────────────────────────────

  describe('simulateAfter34hRestart', () => {
    it('should reset everything including cycle', () => {
      const state = freshState({
        hoursDriven: 10,
        onDutyTime: 13,
        hoursSinceBreak: 7,
        cycleHoursUsed: 68,
        cycleDaysData: [{ date: '2026-03-01', hoursWorked: 10 }],
      });
      const after = service.simulateAfter34hRestart(state);

      expect(after.hoursDriven).toBe(0);
      expect(after.onDutyTime).toBe(0);
      expect(after.hoursSinceBreak).toBe(0);
      expect(after.drivingHoursSinceBreak).toBe(0);
      expect(after.cycleHoursUsed).toBe(0);
      expect(after.cycleDaysData).toEqual([]);
    });
  });

  // ─── simulateAfterSplitRest ──────────────────────────────────────────────

  // ─── Split sleeper berth (FMCSA §395.1(g)) ───────────────────────────────
  //
  // A qualifying sleeper period (≥7h for 7/3, ≥8h for 8/2) PAUSES the 14-hour
  // duty window. The first portion is not the END of the split — it begins it
  // (firstPortionCompleted reflects "first portion done", second still pending).
  // While paused, post-resume on-duty time counts against (14 − pausedDutyWindow),
  // not against a freshly-ticking onDutyTime. Completing both portions resets the
  // daily clocks (cycle preserved).

  describe('simulateAfterSplitRest', () => {
    it('should begin the split and pause the duty window on first portion (7_3)', () => {
      const state = freshState({ onDutyTime: 6, hoursSinceBreak: 6, drivingHoursSinceBreak: 6 });
      const after = service.simulateAfterSplitRest(state, '7_3', 'first');

      expect(after.splitRestState).toEqual({
        inSplit: true,
        firstPortionType: 'sleeper_7',
        firstPortionCompleted: true, // first portion DONE; second still pending (inSplit=true)
        pausedDutyWindow: 6,
      });
      expect(after.hoursSinceBreak).toBe(0); // qualifying sleeper satisfies the break
      expect(after.drivingHoursSinceBreak).toBe(0);
    });

    it('should pause duty window on first portion (8_2)', () => {
      const state = freshState({ onDutyTime: 8 });
      const after = service.simulateAfterSplitRest(state, '8_2', 'first');

      expect(after.splitRestState.firstPortionType).toBe('sleeper_8');
      expect(after.splitRestState.pausedDutyWindow).toBe(8);
    });

    it('excludes the qualifying sleeper from the 14h window (§395.1(g))', () => {
      // Driver had 8h on-duty, took an 8h sleeper portion, then resumed and drove
      // 4h. The sleeper is off-duty so it is NEVER added to onDutyTime — the window
      // counts only the 12h of non-sleeper on-duty (8 + 4), leaving 2h. The 8h
      // sleeper does not consume the window (that's the whole point of the split).
      const afterFirst = service.simulateAfterSplitRest(freshState({ onDutyTime: 8 }), '8_2', 'first');
      // The first portion must not charge the sleeper to the duty clock.
      expect(afterFirst.onDutyTime).toBe(8);
      const afterResume = service.simulateAfterDriving(afterFirst, 4, 4); // onDutyTime now 12, NOT 20

      const dutyCheck = service.validateCompliance(afterResume).checks.find((c) => c.rule === '14-hour duty window');
      expect(dutyCheck.remaining).toBe(2); // 14 − 12 non-sleeper on-duty
      expect(service.hoursUntilRestRequired(afterResume)).toBeLessThanOrEqual(2);
    });

    it('should reset daily clocks on second portion but keep cycle', () => {
      const state = freshState({
        hoursDriven: 8,
        onDutyTime: 10,
        drivingHoursSinceBreak: 5,
        cycleHoursUsed: 40,
        splitRestState: {
          inSplit: true,
          firstPortionType: 'sleeper_7',
          firstPortionCompleted: true,
          pausedDutyWindow: 6,
        },
      });
      const after = service.simulateAfterSplitRest(state, '7_3', 'second');

      expect(after.hoursDriven).toBe(0);
      expect(after.onDutyTime).toBe(0);
      expect(after.hoursSinceBreak).toBe(0);
      expect(after.drivingHoursSinceBreak).toBe(0);
      expect(after.cycleHoursUsed).toBe(40); // cycle preserved
      expect(after.splitRestState).toBeUndefined();
    });
  });

  // ─── needsRestart ────────────────────────────────────────────────────────

  describe('needsRestart', () => {
    it('should return true when additional drive would exceed cycle', () => {
      expect(service.needsRestart(freshState({ cycleHoursUsed: 65 }), 6)).toBe(true);
    });

    it('should return false when additional drive fits in cycle', () => {
      expect(service.needsRestart(freshState({ cycleHoursUsed: 60 }), 5)).toBe(false);
    });
  });

  // ─── createInitialState ──────────────────────────────────────────────────

  describe('createInitialState', () => {
    it('should return all counters at zero', () => {
      const state = service.createInitialState();

      expect(state.hoursDriven).toBe(0);
      expect(state.onDutyTime).toBe(0);
      expect(state.hoursSinceBreak).toBe(0);
      expect(state.drivingHoursSinceBreak).toBe(0);
      expect(state.cycleHoursUsed).toBe(0);
      expect(state.cycleDaysData).toEqual([]);
      expect(state.splitRestState).toBeUndefined();
    });
  });

  // ─── validateCompliance aggregate ────────────────────────────────────────

  describe('validateCompliance aggregate result', () => {
    it('should be fully compliant when all checks pass', () => {
      const result = service.validateCompliance(freshState());

      expect(result.isCompliant).toBe(true);
      expect(result.checks).toHaveLength(4);
      expect(result.checks.every((c) => c.isCompliant)).toBe(true);
    });

    it('should be non-compliant when any check fails', () => {
      const result = service.validateCompliance(freshState({ hoursDriven: 12 }));

      expect(result.isCompliant).toBe(false);
    });

    it('should compute hoursAvailableToDrive as min of remaining', () => {
      const state = freshState({
        hoursDriven: 5, // 6 remaining
        onDutyTime: 10, // 4 remaining
        cycleHoursUsed: 60, // 10 remaining
      });
      const result = service.validateCompliance(state);

      expect(result.hoursAvailableToDrive).toBe(4); // min(6,4,10)
    });

    it('should return 0 hoursAvailableToDrive when any limit exhausted', () => {
      const result = service.validateCompliance(freshState({ hoursDriven: 11 }));

      expect(result.hoursAvailableToDrive).toBe(0);
    });
  });

  // ─── Edge cases ──────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('should handle driver just started shift (all at 0)', () => {
      const result = service.validateCompliance(freshState());

      expect(result.isCompliant).toBe(true);
      expect(result.hoursAvailableToDrive).toBe(11); // min of drive(11), duty(14), cycle(70)
      expect(result.hoursUntilBreakRequired).toBe(8);
      expect(result.needsRestart).toBe(false);
    });

    it('should handle driver near end of cycle', () => {
      const result = service.validateCompliance(freshState({ cycleHoursUsed: 69.5 }));

      expect(result.isCompliant).toBe(true);
      expect(result.cycleHoursRemaining).toBe(0.5);
      expect(result.hoursAvailableToDrive).toBe(0.5);
    });
  });
});
