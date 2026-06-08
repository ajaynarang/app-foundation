import { TrailerMerger } from '../trailer-merger';

describe('TrailerMerger', () => {
  let merger: TrailerMerger;

  beforeEach(() => {
    merger = new TrailerMerger();
  });

  it('should prioritize TMS data over ELD data when TMS has value', () => {
    const tmsData = {
      vin: '1UYVS2538GU819752',
      make: 'GREAT DANE',
      model: 'FREEDOM LT',
      year: 2022,
      licensePlate: 'TX T42-9981',
    };

    const eldData = {
      id: 'eld-trailer-001',
      serialNumber: 'ELD-VIN-WRONG',
      make: 'WABASH_WRONG',
      model: 'DURAPLATE_WRONG',
      year: '2020',
      licensePlate: 'CA ABC-1234',
    };

    const merged = merger.merge(tmsData, eldData);

    expect(merged.vin).toBe('1UYVS2538GU819752'); // TMS wins
    expect(merged.make).toBe('GREAT DANE'); // TMS wins
    expect(merged.model).toBe('FREEDOM LT'); // TMS wins
    expect(merged.year).toBe(2022); // TMS wins
    expect(merged.licensePlate).toBe('TX T42-9981'); // TMS wins
  });

  it('should use ELD data to fill gaps when TMS data is missing', () => {
    const tmsData = {}; // No TMS data

    const eldData = {
      id: 'eld-trailer-002',
      serialNumber: '1UYVS2538GU819752',
      make: 'WABASH',
      model: 'DURAPLATE',
      year: '2021',
      licensePlate: 'IL X99-3344',
    };

    const merged = merger.merge(tmsData, eldData);

    expect(merged.vin).toBe('1UYVS2538GU819752'); // ELD fills gap
    expect(merged.make).toBe('WABASH'); // ELD fills gap
    expect(merged.model).toBe('DURAPLATE'); // ELD fills gap
    expect(merged.year).toBe(2021); // ELD fills gap (converted to number)
    expect(merged.licensePlate).toBe('IL X99-3344'); // ELD fills gap
  });

  it('should always include eldTelematicsMetadata with vendor and eldId', () => {
    const eldData = {
      id: 'eld-trailer-003',
    };

    const merged = merger.merge({}, eldData);

    expect(merged.eldTelematicsMetadata).toEqual({
      eldVendor: 'samsara',
      eldId: 'eld-trailer-003',
      lastSyncAt: expect.any(String),
    });
  });

  it('should use vendor parameter in metadata', () => {
    const eldData = {
      id: 'eld-trailer-004',
    };

    const merged = merger.merge({}, eldData, 'keeptruckin');

    expect(merged.eldTelematicsMetadata.eldVendor).toBe('keeptruckin');
  });

  it('should handle undefined year from ELD (converts string to number)', () => {
    const eldData = {
      id: 'eld-trailer-005',
      year: '2019',
    };

    const merged = merger.merge({}, eldData);

    expect(merged.year).toBe(2019);
    expect(typeof merged.year).toBe('number');
  });

  it('should return undefined fields when both sources are missing', () => {
    const eldData = {
      id: 'eld-trailer-006',
    };

    const merged = merger.merge({}, eldData);

    expect(merged.vin).toBeUndefined();
    expect(merged.make).toBeUndefined();
    expect(merged.model).toBeUndefined();
    expect(merged.year).toBeUndefined();
    expect(merged.licensePlate).toBeUndefined();
  });
});
