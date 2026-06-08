import { realFacilityName } from '../real-facility-name';

describe('realFacilityName (SQ-112)', () => {
  it('returns a real facility name unchanged (trimmed)', () => {
    expect(realFacilityName('  Acme Foods DC  ')).toBe('Acme Foods DC');
  });

  it('returns undefined for the legacy "Unknown Facility" placeholder (any case)', () => {
    expect(realFacilityName('Unknown Facility')).toBeUndefined();
    expect(realFacilityName('unknown facility')).toBeUndefined();
    expect(realFacilityName('  UNKNOWN FACILITY ')).toBeUndefined();
  });

  it('returns undefined for empty / nullish names', () => {
    expect(realFacilityName('')).toBeUndefined();
    expect(realFacilityName('   ')).toBeUndefined();
    expect(realFacilityName(null)).toBeUndefined();
    expect(realFacilityName(undefined)).toBeUndefined();
  });

  it('keeps a legitimate name that merely contains the word "unknown"', () => {
    expect(realFacilityName('Unknown Lane Logistics')).toBe('Unknown Lane Logistics');
  });
});
