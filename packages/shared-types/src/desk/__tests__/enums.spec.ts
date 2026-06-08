import {
  EPISODE_STATUSES,
  HANDLED_EPISODE_STATUSES,
  NEEDS_YOU_EPISODE_STATUSES,
  OPEN_EPISODE_STATUSES,
  TERMINAL_EPISODE_STATUSES,
} from '../enums';

/**
 * View-set taxonomy guards. The DB-lifecycle sets (OPEN_/TERMINAL_) drive
 * dedupe + close; the view sets (HANDLED_/NEEDS_YOU_) drive which Desk tab
 * an episode surfaces on. The crux of the escalated-lifecycle fix: an
 * ESCALATED episode is unfinished business — it belongs on Needs-you, never
 * on Handled — even though it is DB-closed (has a closedAt).
 */
describe('desk episode view sets', () => {
  it('ESCALATED is a Needs-you status, not a Handled status', () => {
    expect(NEEDS_YOU_EPISODE_STATUSES).toContain('ESCALATED');
    expect(HANDLED_EPISODE_STATUSES).not.toContain('ESCALATED');
  });

  it('Handled set is exactly the genuinely-ended statuses', () => {
    expect([...HANDLED_EPISODE_STATUSES].sort()).toEqual(
      ['CANCELLED', 'EXPIRED', 'FAILED', 'REJECTED_BY_OPERATOR', 'RESOLVED'].sort(),
    );
  });

  it('Needs-you set is RUNNING + WAITING_APPROVAL + ESCALATED', () => {
    expect([...NEEDS_YOU_EPISODE_STATUSES].sort()).toEqual(['ESCALATED', 'RUNNING', 'WAITING_APPROVAL'].sort());
  });

  it('every view-set status is a valid episode status', () => {
    for (const status of [...HANDLED_EPISODE_STATUSES, ...NEEDS_YOU_EPISODE_STATUSES]) {
      expect(EPISODE_STATUSES).toContain(status);
    }
  });

  it('view sets together partition every episode status (no leaks, no gaps)', () => {
    const union = new Set([...HANDLED_EPISODE_STATUSES, ...NEEDS_YOU_EPISODE_STATUSES]);
    expect([...union].sort()).toEqual([...EPISODE_STATUSES].sort());
    // Disjoint — no status lives on both tabs.
    expect(union.size).toBe(HANDLED_EPISODE_STATUSES.length + NEEDS_YOU_EPISODE_STATUSES.length);
  });

  it('does NOT change the DB-lifecycle sets (dedupe + close depend on them)', () => {
    // ESCALATED stays terminal at the DB level — it is closed with closedAt.
    expect(TERMINAL_EPISODE_STATUSES).toContain('ESCALATED');
    expect([...OPEN_EPISODE_STATUSES].sort()).toEqual(['RUNNING', 'WAITING_APPROVAL'].sort());
  });
});
