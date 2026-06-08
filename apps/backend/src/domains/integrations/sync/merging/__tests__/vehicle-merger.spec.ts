import { VehicleMerger } from '../vehicle-merger';

describe('VehicleMerger', () => {
  let merger: VehicleMerger;

  beforeEach(() => {
    merger = new VehicleMerger();
  });

  it('should prioritize TMS operational data over ELD', () => {
    const tmsData = {
      make: 'FREIGHTLINER',
      model: 'CASCADIA',
      year: 2018,
      vin: '1FUJGHDV9JLJY8062',
      licensePlate: 'TX R70-1836',
      status: 'ACTIVE',
    };

    const eldData = {
      make: 'FREIGHTLINER_WRONG', // Should be ignored
      model: 'CASCADIA_WRONG',
      eldId: '281474996387574',
      serial: 'G97TEAX5GM',
    };

    const merged = merger.merge(tmsData, eldData);

    expect(merged.make).toBe('FREIGHTLINER'); // TMS wins
    expect(merged.model).toBe('CASCADIA'); // TMS wins
    expect(merged.eldTelematicsMetadata).toMatchObject({
      eldId: '281474996387574',
      serial: 'G97TEAX5GM',
      cameraSerial: null,
    });
  });

  it('should use ELD data when TMS data is missing', () => {
    const tmsData = {
      vin: '1FUJGHDV9JLJY8062',
      status: 'ACTIVE',
      // No make/model from TMS
    };

    const eldData = {
      make: 'FREIGHTLINER',
      model: 'CASCADIA',
      eldId: '281474996387574',
    };

    const merged = merger.merge(tmsData, eldData);

    expect(merged.make).toBe('FREIGHTLINER'); // ELD fills gap
    expect(merged.model).toBe('CASCADIA'); // ELD fills gap
  });

  it('should package ELD data into eldTelematicsMetadata JSONB', () => {
    const tmsData = {
      vin: '1FUJGHDV9JLJY8062',
    };

    const eldData = {
      eldVendor: 'SAMSARA_ELD',
      eldId: '281474996387574',
      serial: 'G97TEAX5GM',
      gateway: { serial: 'G97T-EAX-5GM', model: 'VG55NA' },
      esn: '471928S0529795',
    };

    const merged = merger.merge(tmsData, eldData);

    expect(merged.eldTelematicsMetadata).toEqual({
      eldVendor: 'SAMSARA_ELD',
      eldId: '281474996387574',
      serial: 'G97TEAX5GM',
      gateway: { serial: 'G97T-EAX-5GM', model: 'VG55NA' },
      esn: '471928S0529795',
      cameraSerial: null,
      lastSyncAt: expect.any(String),
    });
  });

  it('should handle empty TMS and ELD data gracefully', () => {
    const merged = merger.merge({}, {});

    expect(merged).toBeDefined();
    expect(merged.eldTelematicsMetadata).toBeUndefined();
  });

  it('should not include eldTelematicsMetadata if no ELD data provided', () => {
    const tmsData = {
      make: 'FREIGHTLINER',
      vin: '1FUJGHDV9JLJY8062',
    };

    const merged = merger.merge(tmsData, {});

    expect(merged.make).toBe('FREIGHTLINER');
    expect(merged.eldTelematicsMetadata).toBeUndefined();
  });
});
