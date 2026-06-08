import { RateconExtractionSchema, RateconSchema, computeConfidence, type RateconExtraction } from '../ratecon.schema';

describe('RateconExtractionSchema', () => {
  const validExtraction: RateconExtraction = {
    load_number: '4141754-1',
    broker_name: 'Armstrong Transport Group',
    rate_total_usd: 1150.0,
    stops: [
      {
        sequence: 1,
        action_type: 'pickup',
        facility_name: 'Acme Warehouse',
        address: '76 MAIN ST',
        city: 'Boston',
        state: 'MA',
        zip_code: '02101',
        appointment_date: '2026-03-12',
        appointment_time: '08:00',
      },
      {
        sequence: 2,
        action_type: 'delivery',
        facility_name: 'Target DC',
        address: '202 PORT JERSEY BLVD',
        city: 'Jersey City',
        state: 'NJ',
        zip_code: '07305',
        appointment_date: '2026-03-13',
        appointment_time: '14:00',
      },
    ],
  };

  it('should validate a complete extraction', () => {
    const result = RateconExtractionSchema.safeParse(validExtraction);
    expect(result.success).toBe(true);
  });

  it('should validate with all optional fields', () => {
    const full = {
      ...validExtraction,
      broker_mc: '546542',
      equipment_type: "53' Van",
      commodity: 'Paper',
      weight_lbs: 42762,
      pieces: 24,
      miles: 215,
      special_instructions: 'Must track via Macropoint',
    };
    const result = RateconExtractionSchema.safeParse(full);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.broker_mc).toBe('546542');
      expect(result.data.weight_lbs).toBe(42762);
      expect(result.data.pieces).toBe(24);
      expect(result.data.miles).toBe(215);
    }
  });

  it('should validate minimal extraction (required fields only)', () => {
    const minimal = {
      load_number: '12345',
      broker_name: 'Broker',
      rate_total_usd: 500,
      stops: [
        {
          sequence: 1,
          action_type: 'pickup',
          facility_name: 'Unknown Facility',
        },
        {
          sequence: 2,
          action_type: 'delivery',
          facility_name: 'Unknown Facility',
        },
      ],
    };
    const result = RateconExtractionSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });

  it('should reject missing load_number', () => {
    const invalid = { ...validExtraction, load_number: undefined };
    const result = RateconExtractionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject missing broker_name', () => {
    const { broker_name: _broker_name, ...rest } = validExtraction;
    const result = RateconExtractionSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject missing rate_total_usd', () => {
    const { rate_total_usd: _rate_total_usd, ...rest } = validExtraction;
    const result = RateconExtractionSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject missing stops', () => {
    const { stops: _stops, ...rest } = validExtraction;
    const result = RateconExtractionSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject invalid action_type in stops', () => {
    const invalid = {
      ...validExtraction,
      stops: [{ sequence: 1, action_type: 'loading', facility_name: 'Warehouse' }],
    };
    const result = RateconExtractionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject non-number rate_total_usd', () => {
    const invalid = { ...validExtraction, rate_total_usd: '$1,150.00' };
    const result = RateconExtractionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should accept empty stops array', () => {
    const withEmptyStops = { ...validExtraction, stops: [] };
    const result = RateconExtractionSchema.safeParse(withEmptyStops);
    expect(result.success).toBe(true);
  });
});

describe('RateconSchema (with confidence)', () => {
  it('should validate extraction + confidence together', () => {
    const full = {
      load_number: '12345',
      broker_name: 'Arrive Logistics',
      rate_total_usd: 850,
      stops: [
        { sequence: 1, action_type: 'pickup', facility_name: 'Warehouse A' },
        { sequence: 2, action_type: 'delivery', facility_name: 'Store B' },
      ],
      confidence: {
        reference_number: 'high',
        broker_name: 'high',
        rate: 'high',
        stops: [
          { sequence: 1, location: 'medium', date: null },
          { sequence: 2, location: 'low', date: 'high' },
        ],
      },
    };
    const result = RateconSchema.safeParse(full);
    expect(result.success).toBe(true);
  });

  it('should validate without confidence (optional)', () => {
    const noConfidence = {
      load_number: '12345',
      broker_name: 'Test',
      rate_total_usd: 500,
      stops: [{ sequence: 1, action_type: 'pickup', facility_name: 'A' }],
    };
    const result = RateconSchema.safeParse(noConfidence);
    expect(result.success).toBe(true);
  });
});

describe('computeConfidence', () => {
  it('should return high confidence for well-formed data', () => {
    const data: RateconExtraction = {
      load_number: '4141754-1',
      broker_name: 'Armstrong Transport Group',
      rate_total_usd: 1150,
      stops: [
        {
          sequence: 1,
          action_type: 'pickup',
          facility_name: 'Acme Warehouse',
          address: '76 MAIN ST',
          city: 'Boston',
          state: 'MA',
          zip_code: '02101',
          appointment_date: '2026-03-12',
        },
      ],
    };

    const confidence = computeConfidence(data);
    expect(confidence.reference_number).toBe('high');
    expect(confidence.broker_name).toBe('high');
    expect(confidence.rate).toBe('high');
    expect(confidence.stops[0].location).toBe('high');
    expect(confidence.stops[0].date).toBe('high');
  });

  it('should return low confidence for missing/empty fields', () => {
    const data: RateconExtraction = {
      load_number: '',
      broker_name: '',
      rate_total_usd: 0,
      stops: [
        {
          sequence: 1,
          action_type: 'pickup',
          facility_name: 'Unknown Facility',
        },
      ],
    };

    const confidence = computeConfidence(data);
    expect(confidence.reference_number).toBe('low');
    expect(confidence.broker_name).toBe('low');
    expect(confidence.rate).toBe('low');
    expect(confidence.stops[0].location).toBe('low');
    expect(confidence.stops[0].date).toBeNull();
  });

  it('should return medium confidence for partial broker name', () => {
    const data: RateconExtraction = {
      load_number: '12345',
      broker_name: 'Arrive',
      rate_total_usd: 500,
      stops: [
        {
          sequence: 1,
          action_type: 'pickup',
          facility_name: 'Warehouse',
          city: 'Dallas',
          state: 'TX',
        },
      ],
    };

    const confidence = computeConfidence(data);
    expect(confidence.broker_name).toBe('medium');
    expect(confidence.stops[0].location).toBe('medium');
  });

  it('should return medium for short single-word broker name', () => {
    const data: RateconExtraction = {
      load_number: '12345',
      broker_name: 'IL2000',
      rate_total_usd: 500,
      stops: [],
    };
    const confidence = computeConfidence(data);
    expect(confidence.broker_name).toBe('medium');
  });

  it('should return low for very short broker name', () => {
    const data: RateconExtraction = {
      load_number: '12345',
      broker_name: 'AB',
      rate_total_usd: 500,
      stops: [],
    };
    const confidence = computeConfidence(data);
    expect(confidence.broker_name).toBe('low');
  });

  it('should return medium for stop with only city', () => {
    const data: RateconExtraction = {
      load_number: '12345',
      broker_name: 'Test Broker Inc',
      rate_total_usd: 500,
      stops: [
        {
          sequence: 1,
          action_type: 'pickup',
          facility_name: 'Unknown Facility',
          city: 'Chicago',
        },
      ],
    };
    const confidence = computeConfidence(data);
    expect(confidence.stops[0].location).toBe('medium');
  });

  it('should return medium for stop with only real facility name', () => {
    const data: RateconExtraction = {
      load_number: '12345',
      broker_name: 'Test Broker Inc',
      rate_total_usd: 500,
      stops: [
        {
          sequence: 1,
          action_type: 'pickup',
          facility_name: 'Walmart DC',
        },
      ],
    };
    const confidence = computeConfidence(data);
    expect(confidence.stops[0].location).toBe('medium');
  });

  it('should return medium for non-standard date format', () => {
    const data: RateconExtraction = {
      load_number: '12345',
      broker_name: 'Test Broker Inc',
      rate_total_usd: 500,
      stops: [
        {
          sequence: 1,
          action_type: 'pickup',
          facility_name: 'Warehouse',
          appointment_date: 'March 12, 2026',
        },
      ],
    };
    const confidence = computeConfidence(data);
    expect(confidence.stops[0].date).toBe('medium');
  });

  it('should return low for very short date-like content', () => {
    const data: RateconExtraction = {
      load_number: '12345',
      broker_name: 'Test Broker Inc',
      rate_total_usd: 500,
      stops: [
        {
          sequence: 1,
          action_type: 'pickup',
          facility_name: 'Warehouse',
          appointment_date: '3/1',
        },
      ],
    };
    const confidence = computeConfidence(data);
    expect(confidence.stops[0].date).toBe('low');
  });

  it('should return low for single-char load number', () => {
    const data: RateconExtraction = {
      load_number: 'A',
      broker_name: 'Test Broker Inc',
      rate_total_usd: 500,
      stops: [],
    };
    const confidence = computeConfidence(data);
    expect(confidence.reference_number).toBe('low');
  });

  it('should return high for long single-word broker name', () => {
    const data: RateconExtraction = {
      load_number: '12345',
      broker_name: 'Freightliner',
      rate_total_usd: 500,
      stops: [],
    };
    const confidence = computeConfidence(data);
    expect(confidence.broker_name).toBe('high');
  });

  it('should handle stop with only state', () => {
    const data: RateconExtraction = {
      load_number: '12345',
      broker_name: 'Test Broker Inc',
      rate_total_usd: 500,
      stops: [
        {
          sequence: 1,
          action_type: 'pickup',
          facility_name: 'Unknown Facility',
          state: 'TX',
        },
      ],
    };
    const confidence = computeConfidence(data);
    expect(confidence.stops[0].location).toBe('medium');
  });

  it('should return low for stop with invalid state format', () => {
    const data: RateconExtraction = {
      load_number: '12345',
      broker_name: 'Test Broker Inc',
      rate_total_usd: 500,
      stops: [
        {
          sequence: 1,
          action_type: 'pickup',
          facility_name: 'Unknown Facility',
          state: 'Texas',
        },
      ],
    };
    const confidence = computeConfidence(data);
    // "Texas" doesn't match STATE_REGEX /^[A-Z]{2}$/, so state not valid
    // facility is "Unknown Facility", so no real facility -> location = low
    expect(confidence.stops[0].location).toBe('low');
  });
});
