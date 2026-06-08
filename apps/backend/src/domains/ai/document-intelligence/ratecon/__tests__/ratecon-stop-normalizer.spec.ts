import { parseCombinedLocation, normalizeStopLocation, normalizeStopLocations } from '../ratecon-stop-normalizer';
import { validateReadyForConfirmation } from '../../../../fleet/loads/utils/load-confirmation-rules';

describe('parseCombinedLocation (SQ-112)', () => {
  it('splits the exact SQ-112 pickup line', () => {
    expect(parseCombinedLocation('Fair Lawn, NJ US 07410')).toEqual({
      city: 'Fair Lawn',
      state: 'NJ',
      zip: '07410',
    });
  });

  it('splits the exact SQ-112 delivery line', () => {
    expect(parseCombinedLocation('Taunton, MA US 02780')).toEqual({
      city: 'Taunton',
      state: 'MA',
      zip: '02780',
    });
  });

  it('handles no country token', () => {
    expect(parseCombinedLocation('Dallas, TX 75201')).toEqual({ city: 'Dallas', state: 'TX', zip: '75201' });
  });

  it('handles USA spelled out', () => {
    expect(parseCombinedLocation('Atlanta, GA USA 30354')).toEqual({ city: 'Atlanta', state: 'GA', zip: '30354' });
  });

  it('handles ZIP+4', () => {
    expect(parseCombinedLocation('Taunton, MA US 02780-1234')).toEqual({
      city: 'Taunton',
      state: 'MA',
      zip: '02780-1234',
    });
  });

  it('handles multi-word + punctuated city names', () => {
    expect(parseCombinedLocation('St. Louis, MO 63101')?.city).toBe('St. Louis');
    expect(parseCombinedLocation('Winston-Salem, NC 27101')?.city).toBe('Winston-Salem');
    expect(parseCombinedLocation("O'Fallon, IL 62269")?.city).toBe("O'Fallon");
  });

  it('lowercases-then-normalizes the state to uppercase', () => {
    expect(parseCombinedLocation('Fair Lawn, nj US 07410')?.state).toBe('NJ');
  });

  it('parses a street-prefixed line by capturing the trailing city/state/zip', () => {
    expect(parseCombinedLocation('76 Main St, Fair Lawn, NJ US 07410')).toEqual({
      city: 'Fair Lawn',
      state: 'NJ',
      zip: '07410',
    });
  });

  it('handles federal district + territory codes', () => {
    expect(parseCombinedLocation('Washington, DC 20001')?.state).toBe('DC');
    expect(parseCombinedLocation('San Juan, PR 00901')?.state).toBe('PR');
  });

  // ── Negative cases — must NOT split (no false positives) ──────────────

  it('returns null for a bogus two-letter state token', () => {
    expect(parseCombinedLocation('Acme, XX 07410')).toBeNull();
  });

  it('returns null when there is no ZIP', () => {
    expect(parseCombinedLocation('Fair Lawn, NJ')).toBeNull();
  });

  it('returns null for a plain facility name', () => {
    expect(parseCombinedLocation('Walmart Distribution Center #6094')).toBeNull();
  });

  it('returns null for a bare street address', () => {
    expect(parseCombinedLocation('202 Port Jersey Blvd')).toBeNull();
  });

  it('returns null for blank / nullish input', () => {
    expect(parseCombinedLocation('')).toBeNull();
    expect(parseCombinedLocation(undefined)).toBeNull();
    expect(parseCombinedLocation(null)).toBeNull();
  });

  it('returns null when ZIP is malformed (4 or 6 digits)', () => {
    expect(parseCombinedLocation('Dallas, TX 7520')).toBeNull();
    expect(parseCombinedLocation('Dallas, TX 752015')).toBeNull();
  });
});

describe('normalizeStopLocation (SQ-112)', () => {
  it('backfills from a combined string mis-filed into the city field', () => {
    const { stop, changed } = normalizeStopLocation({
      facility_name: 'Shipper Pickup',
      city: 'Fair Lawn, NJ US 07410',
      state: '',
      zip_code: '',
    });
    expect(changed).toBe(true);
    expect(stop.city).toBe('Fair Lawn');
    expect(stop.state).toBe('NJ');
    expect(stop.zip_code).toBe('07410');
  });

  it('backfills from the address field when city is blank', () => {
    const { stop, changed } = normalizeStopLocation({
      address: 'Taunton, MA US 02780',
      city: '',
      state: '',
    });
    expect(changed).toBe(true);
    expect(stop.city).toBe('Taunton');
    expect(stop.state).toBe('MA');
  });

  it('NEVER overwrites a city/state the model already extracted', () => {
    const { stop, changed } = normalizeStopLocation({
      facility_name: 'Wrongtown, ZZ US 99999',
      city: 'Houston',
      state: 'TX',
      zip_code: '77001',
    });
    expect(changed).toBe(false);
    expect(stop.city).toBe('Houston');
    expect(stop.state).toBe('TX');
    expect(stop.zip_code).toBe('77001');
  });

  it('backfills only the missing field (state) and leaves a good city intact', () => {
    const { stop, changed } = normalizeStopLocation({
      address: 'Fair Lawn, NJ US 07410',
      city: 'Fair Lawn',
      state: '',
      zip_code: '07410',
    });
    expect(changed).toBe(true);
    expect(stop.city).toBe('Fair Lawn'); // unchanged
    expect(stop.state).toBe('NJ'); // backfilled
  });

  it('does nothing when no field holds a parseable location', () => {
    const input = { facility_name: 'Acme Warehouse', address: '', city: '', state: '' };
    const { stop, changed } = normalizeStopLocation(input);
    expect(changed).toBe(false);
    expect(stop.city).toBe('');
  });

  it('does nothing when everything is already populated', () => {
    const input = { city: 'Dallas', state: 'TX', zip_code: '75201' };
    const { changed } = normalizeStopLocation(input);
    expect(changed).toBe(false);
  });
});

describe('normalizeStopLocations (array)', () => {
  it('backfills both SQ-112 stops and reports the count', () => {
    const { stops, backfilledCount } = normalizeStopLocations([
      { city: 'Fair Lawn, NJ US 07410', state: '', zip_code: '' },
      { city: 'Taunton, MA US 02780', state: '', zip_code: '' },
    ]);
    expect(backfilledCount).toBe(2);
    expect(stops[0]).toMatchObject({ city: 'Fair Lawn', state: 'NJ', zip_code: '07410' });
    expect(stops[1]).toMatchObject({ city: 'Taunton', state: 'MA', zip_code: '02780' });
  });

  it('leaves well-formed stops untouched', () => {
    const { backfilledCount } = normalizeStopLocations([{ city: 'Dallas', state: 'TX', zip_code: '75201' }]);
    expect(backfilledCount).toBe(0);
  });
});

// End-to-end regression for the exact SQ-112 document
// ("925789 - Fair Lawn NJ to Taunton MA"). Pins the real stop strings + proves
// the DRAFT→PENDING validator ("N required fields missing") clears post-fix.
describe('SQ-112 regression — real Prosponsive ratecon', () => {
  // What the conservative model produced for this PDF (per the bug screenshot):
  // the combined "City, ST US ZIP" line landed in `city`, discrete fields blank.
  const preFixStops = [
    { city: 'Fair Lawn, NJ US 07410', state: '', zip_code: '', actionType: 'pickup' },
    { city: 'Taunton, MA US 02780', state: '', zip_code: '', actionType: 'delivery' },
  ];

  it('produces the same 4 missing-field issues BEFORE the fix', () => {
    const issues = validateReadyForConfirmation({
      customerId: 1,
      rateCents: 120000,
      referenceNumber: 'Load-925789',
      // city contains the combined line, so the validator (which trims) still
      // counts it present — emulate the screenshot by passing the raw fields a
      // pre-fix create would have written (empty discrete city/state).
      stops: preFixStops.map((s) => ({ actionType: s.actionType, city: '', state: '' })),
    });
    const messages = issues.map((i) => i.message);
    expect(messages).toEqual([
      'Stop 1 is missing city',
      'Stop 1 is missing state',
      'Stop 2 is missing city',
      'Stop 2 is missing state',
    ]);
  });

  it('clears every missing-field issue AFTER the normalizer', () => {
    const { stops, backfilledCount } = normalizeStopLocations(preFixStops);
    expect(backfilledCount).toBe(2);
    expect(stops[0]).toMatchObject({ city: 'Fair Lawn', state: 'NJ', zip_code: '07410' });
    expect(stops[1]).toMatchObject({ city: 'Taunton', state: 'MA', zip_code: '02780' });

    const issues = validateReadyForConfirmation({
      customerId: 1,
      rateCents: 120000,
      referenceNumber: 'Load-925789',
      stops: stops.map((s) => ({ actionType: s.actionType, city: s.city, state: s.state })),
    });
    expect(issues).toEqual([]);
  });
});
