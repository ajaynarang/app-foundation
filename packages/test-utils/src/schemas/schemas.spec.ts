import { describe, it, expect } from 'vitest';
import { DriverSchemas, VehicleSchemas, LoadSchemas, expectContract } from './index.js';

describe('schemas', () => {
  it('exports driver schemas', () => {
    expect(Object.keys(DriverSchemas).length).toBeGreaterThan(0);
  });

  it('exports vehicle schemas', () => {
    expect(Object.keys(VehicleSchemas).length).toBeGreaterThan(0);
  });

  it('exports load schemas', () => {
    expect(Object.keys(LoadSchemas).length).toBeGreaterThan(0);
  });

  it('re-exports expectContract helper', () => {
    expect(typeof expectContract).toBe('function');
  });
});
