import { describe, it, expect } from 'vitest';
import { PlatformSchemas, SupportSchemas, ExampleSchemas, expectContract } from './index.js';

describe('schemas', () => {
  it('exports platform schemas', () => {
    expect(Object.keys(PlatformSchemas).length).toBeGreaterThan(0);
  });

  it('exports support schemas', () => {
    expect(Object.keys(SupportSchemas).length).toBeGreaterThan(0);
  });

  it('exports the example schema pair', () => {
    expect(Object.keys(ExampleSchemas).length).toBeGreaterThan(0);
  });

  it('re-exports expectContract helper', () => {
    expect(typeof expectContract).toBe('function');
  });
});
