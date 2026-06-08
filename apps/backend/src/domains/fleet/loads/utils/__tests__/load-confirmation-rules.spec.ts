import { validateReadyForConfirmation } from '../load-confirmation-rules';

describe('validateReadyForConfirmation', () => {
  const validLoad = {
    customerId: 1,
    rateCents: 150000,
    referenceNumber: 'REF-123',
    stops: [
      { actionType: 'pickup', city: 'Newark', state: 'NJ' },
      { actionType: 'delivery', city: 'Boston', state: 'MA' },
    ],
  };

  it('should return empty array for a valid load', () => {
    const issues = validateReadyForConfirmation(validLoad);
    expect(issues).toEqual([]);
  });

  it('does NOT block confirmation when stops have city+state but no facility name (SQ-112)', () => {
    // An imported no-street ratecon yields stops with a known city/state but an
    // unconfirmed facility. That's a soft "Verify facility" chip, NOT a hard
    // confirmation gate — the dispatcher can still confirm the load. Locking
    // this so a future change to the chip can't accidentally promote it to a gate.
    const issues = validateReadyForConfirmation({
      customerId: 1,
      rateCents: 120000,
      referenceNumber: 'Load-925789',
      stops: [
        { actionType: 'pickup', city: 'Fair Lawn', state: 'NJ' },
        { actionType: 'delivery', city: 'Taunton', state: 'MA' },
      ],
    });
    expect(issues).toEqual([]);
  });

  it('should flag missing customerId', () => {
    const issues = validateReadyForConfirmation({
      ...validLoad,
      customerId: null,
    });
    expect(issues).toContainEqual(expect.objectContaining({ field: 'customerId' }));
  });

  it('should flag zero rateCents', () => {
    const issues = validateReadyForConfirmation({ ...validLoad, rateCents: 0 });
    expect(issues).toContainEqual(expect.objectContaining({ field: 'rateCents' }));
  });

  it('should flag null rateCents', () => {
    const issues = validateReadyForConfirmation({
      ...validLoad,
      rateCents: null,
    });
    expect(issues).toContainEqual(expect.objectContaining({ field: 'rateCents' }));
  });

  it('should flag missing referenceNumber', () => {
    const issues = validateReadyForConfirmation({
      ...validLoad,
      referenceNumber: '',
    });
    expect(issues).toContainEqual(expect.objectContaining({ field: 'referenceNumber' }));
  });

  it('should flag null referenceNumber', () => {
    const issues = validateReadyForConfirmation({
      ...validLoad,
      referenceNumber: null,
    });
    expect(issues).toContainEqual(expect.objectContaining({ field: 'referenceNumber' }));
  });

  it('should flag missing pickup stop', () => {
    const issues = validateReadyForConfirmation({
      ...validLoad,
      stops: [{ actionType: 'delivery', city: 'Boston', state: 'MA' }],
    });
    expect(issues).toContainEqual(expect.objectContaining({ field: 'stops' }));
  });

  it('should flag missing delivery stop', () => {
    const issues = validateReadyForConfirmation({
      ...validLoad,
      stops: [{ actionType: 'pickup', city: 'Newark', state: 'NJ' }],
    });
    expect(issues).toContainEqual(expect.objectContaining({ field: 'stops' }));
  });

  it('should flag empty stops array', () => {
    const issues = validateReadyForConfirmation({ ...validLoad, stops: [] });
    expect(issues).toContainEqual(expect.objectContaining({ field: 'stops' }));
  });

  it('should accept a single stop with actionType "both"', () => {
    const issues = validateReadyForConfirmation({
      ...validLoad,
      stops: [{ actionType: 'both', city: 'Newark', state: 'NJ' }],
    });
    expect(issues).not.toContainEqual(expect.objectContaining({ field: 'stops' }));
  });

  it('should flag stop missing city', () => {
    const issues = validateReadyForConfirmation({
      ...validLoad,
      stops: [
        { actionType: 'pickup', city: 'Newark', state: 'NJ' },
        { actionType: 'delivery', city: '', state: 'MA' },
      ],
    });
    expect(issues).toContainEqual(expect.objectContaining({ field: 'stops[1].city' }));
  });

  it('should flag stop missing state', () => {
    const issues = validateReadyForConfirmation({
      ...validLoad,
      stops: [
        { actionType: 'pickup', city: 'Newark', state: '' },
        { actionType: 'delivery', city: 'Boston', state: 'MA' },
      ],
    });
    expect(issues).toContainEqual(expect.objectContaining({ field: 'stops[0].state' }));
  });

  it('should return multiple issues at once', () => {
    const issues = validateReadyForConfirmation({
      customerId: null,
      rateCents: 0,
      referenceNumber: '',
      stops: [],
    });
    expect(issues.length).toBeGreaterThanOrEqual(4);
  });
});
