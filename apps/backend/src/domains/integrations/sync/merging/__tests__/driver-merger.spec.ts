import { DriverMerger } from '../driver-merger';

describe('DriverMerger', () => {
  let merger: DriverMerger;

  beforeEach(() => {
    merger = new DriverMerger();
  });

  it('should prioritize TMS operational data over ELD', () => {
    const tmsData = {
      firstName: 'John',
      lastName: 'Smith',
      phone: '+19788856169',
      licenseNumber: 'NHL14227039',
      licenseState: 'NH',
      status: 'ACTIVE',
    };

    const eldData = {
      name: 'Oscar Toribo', // Should be ignored
      phone: '+1-978-885-6169', // Wrong format
      eldId: '53207939',
      username: 'Oscar',
    };

    const merged = merger.merge(tmsData, eldData);

    expect(merged.firstName).toBe('John'); // TMS wins
    expect(merged.lastName).toBe('Smith'); // TMS wins
    expect(merged.phone).toBe('+19788856169'); // TMS wins
    expect(merged.eldMetadata).toMatchObject({
      eldId: '53207939',
      username: 'Oscar',
      carrierSettings: null,
      tags: null,
    });
  });

  it('should use ELD data when TMS data is missing', () => {
    const tmsData = {
      firstName: 'John',
      // No phone or license from TMS
    };

    const eldData = {
      phone: '+19788856169',
      licenseNumber: 'NHL14227039',
      licenseState: 'NH',
      eldId: '53207939',
    };

    const merged = merger.merge(tmsData, eldData);

    expect(merged.phone).toBe('+19788856169'); // ELD fills gap
    expect(merged.licenseNumber).toBe('NHL14227039'); // ELD fills gap
    expect(merged.licenseState).toBe('NH'); // ELD fills gap
  });

  it('should package ELD HOS data into eldMetadata JSONB', () => {
    const tmsData = {
      firstName: 'Oscar',
      phone: '+19788856169',
    };

    const eldData = {
      eldVendor: 'SAMSARA_ELD',
      eldId: '53207939',
      username: 'Oscar',
      eldSettings: {
        rulesets: [
          {
            cycle: 'USA 70 hour / 8 day',
            shift: 'US Interstate Property',
            restart: '34-hour Restart',
            break: 'Property (off-duty/sleeper)',
          },
        ],
      },
      timezone: 'America/New_York',
    };

    const merged = merger.merge(tmsData, eldData);

    expect(merged.eldMetadata).toEqual({
      eldVendor: 'SAMSARA_ELD',
      eldId: '53207939',
      username: 'Oscar',
      eldSettings: {
        rulesets: [
          {
            cycle: 'USA 70 hour / 8 day',
            shift: 'US Interstate Property',
            restart: '34-hour Restart',
            break: 'Property (off-duty/sleeper)',
          },
        ],
      },
      carrierSettings: null,
      tags: null,
      timezone: 'America/New_York',
      lastSyncAt: expect.any(String),
    });
  });

  it('should preserve admin-controlled status over ELD status', () => {
    const tmsData = {
      firstName: 'John',
      status: 'INACTIVE', // Admin set to inactive
    };

    const eldData = {
      driverActivationStatus: 'active', // ELD says active
      eldId: '53207939',
    };

    const merged = merger.merge(tmsData, eldData);

    expect(merged.status).toBe('INACTIVE'); // TMS/Admin wins
  });

  it('should handle empty TMS and ELD data gracefully', () => {
    const merged = merger.merge({}, {});

    expect(merged).toBeDefined();
    expect(merged.eldMetadata).toBeUndefined();
  });

  it('should not include eldMetadata if no ELD data provided', () => {
    const tmsData = {
      firstName: 'John',
      lastName: 'Smith',
    };

    const merged = merger.merge(tmsData, {});

    expect(merged.firstName).toBe('John');
    expect(merged.eldMetadata).toBeUndefined();
  });
});
