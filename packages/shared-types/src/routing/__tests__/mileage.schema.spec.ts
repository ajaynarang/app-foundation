import {
  MileageProviderSchema,
  MileageRateBasisSchema,
  TruckMileageResultSchema,
  LoadMileageSummarySchema,
} from '../mileage.schema';

describe('MileageProviderSchema', () => {
  it.each(['here', 'pcmiler', 'osrm'] as const)('accepts %s', (v) => {
    expect(() => MileageProviderSchema.parse(v)).not.toThrow();
  });

  it('rejects unknown provider', () => {
    expect(() => MileageProviderSchema.parse('google')).toThrow();
  });
});

describe('MileageRateBasisSchema', () => {
  it.each(['practical', 'shortest', 'rated'] as const)('accepts %s', (v) => {
    expect(() => MileageRateBasisSchema.parse(v)).not.toThrow();
  });

  it('rejects unknown rate basis', () => {
    expect(() => MileageRateBasisSchema.parse('toll')).toThrow();
  });
});

describe('TruckMileageResultSchema', () => {
  it('parses a complete result', () => {
    const parsed = TruckMileageResultSchema.parse({
      miles: 482.3,
      driveHours: 7.75,
      polyline: 'abc123',
      provider: 'here',
      rateBasis: 'practical',
    });
    expect(parsed.miles).toBe(482.3);
    expect(parsed.driveHours).toBe(7.75);
  });

  it('accepts a result without polyline', () => {
    const parsed = TruckMileageResultSchema.parse({
      miles: 100,
      driveHours: 2,
      provider: 'here',
      rateBasis: 'practical',
    });
    expect(parsed.polyline).toBeUndefined();
  });

  it('rejects negative miles', () => {
    expect(() =>
      TruckMileageResultSchema.parse({
        miles: -1,
        driveHours: 0,
        provider: 'here',
        rateBasis: 'practical',
      }),
    ).toThrow();
  });

  it('rejects negative driveHours', () => {
    expect(() =>
      TruckMileageResultSchema.parse({
        miles: 0,
        driveHours: -0.1,
        provider: 'here',
        rateBasis: 'practical',
      }),
    ).toThrow();
  });
});

describe('LoadMileageSummarySchema', () => {
  it('parses a populated summary', () => {
    const parsed = LoadMileageSummarySchema.parse({
      loadId: 'LD-20260515-001',
      totalMiles: 482.3,
      estimatedDriveHours: 7.75,
      provider: 'here',
      calculatedAt: '2026-05-15T12:00:00.000Z',
    });
    expect(parsed.totalMiles).toBe(482.3);
  });

  it('rejects an empty loadId', () => {
    expect(() =>
      LoadMileageSummarySchema.parse({
        loadId: '',
        totalMiles: 0,
        estimatedDriveHours: 0,
        provider: 'here',
        calculatedAt: '2026-05-15T12:00:00.000Z',
      }),
    ).toThrow();
  });

  it('rejects a malformed calculatedAt', () => {
    expect(() =>
      LoadMileageSummarySchema.parse({
        loadId: 'LD-1',
        totalMiles: 0,
        estimatedDriveHours: 0,
        provider: 'here',
        calculatedAt: 'yesterday',
      }),
    ).toThrow();
  });
});
