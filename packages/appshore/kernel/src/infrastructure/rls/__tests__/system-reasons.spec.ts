import { FOUNDATION_SYSTEM_REASONS, isSystemReason, listSystemReasons, registerSystemReasons } from '../system-reasons';

describe('system-reasons', () => {
  it('accepts a listed reason', () => {
    expect(isSystemReason('sweep.data-retention')).toBe(true);
  });

  it('names the outbox relay and the deadline sweeper', () => {
    expect(isSystemReason('outbox-relay')).toBe(true);
    expect(isSystemReason('deadline-sweep')).toBe(true);
  });

  it('rejects an unlisted reason', () => {
    expect(isSystemReason('because-i-said-so')).toBe(false);
  });

  it('accepts a reason once an app registers it, and lists it after the foundation reasons', () => {
    expect(isSystemReason('app.export')).toBe(false);
    registerSystemReasons(['app.export']);
    expect(isSystemReason('app.export')).toBe(true);
    expect(listSystemReasons().slice(-1)).toEqual(['app.export']);
  });

  it('has no duplicates', () => {
    expect(new Set(FOUNDATION_SYSTEM_REASONS).size).toBe(FOUNDATION_SYSTEM_REASONS.length);
  });
});
