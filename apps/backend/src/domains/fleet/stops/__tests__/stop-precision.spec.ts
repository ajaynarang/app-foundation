import { LocationPrecision } from '@prisma/client';
import { derivePrecision } from '../stop-precision';

describe('derivePrecision', () => {
  it('ROOFTOP when a street address is present and geocode is confident', () => {
    expect(derivePrecision({ hasStreet: true, geocodeConfidence: 0.9 })).toBe(LocationPrecision.ROOFTOP);
  });

  it('CENTROID when city/state/zip only (no street) but geocoded confidently', () => {
    expect(derivePrecision({ hasStreet: false, geocodeConfidence: 0.8 })).toBe(LocationPrecision.CENTROID);
  });

  it('UNKNOWN when geocode confidence is null (geocode failed)', () => {
    expect(derivePrecision({ hasStreet: true, geocodeConfidence: null })).toBe(LocationPrecision.UNKNOWN);
  });

  it('UNKNOWN when geocode confidence is below the threshold, even with a street', () => {
    expect(derivePrecision({ hasStreet: true, geocodeConfidence: 0.3 })).toBe(LocationPrecision.UNKNOWN);
    expect(derivePrecision({ hasStreet: false, geocodeConfidence: 0.49 })).toBe(LocationPrecision.UNKNOWN);
  });

  it('treats confidence exactly at the 0.5 threshold as confident', () => {
    expect(derivePrecision({ hasStreet: true, geocodeConfidence: 0.5 })).toBe(LocationPrecision.ROOFTOP);
  });
});
