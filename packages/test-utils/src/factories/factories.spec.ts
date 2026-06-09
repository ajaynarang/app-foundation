import { describe, it, expect } from 'vitest';
import { buildDriver, buildVehicle, buildLoad } from './index.js';

describe('factories', () => {
  it('buildDriver produces unique emails across calls', () => {
    const a = buildDriver();
    const b = buildDriver();
    expect(a.email).not.toBe(b.email);
    expect(a.email).toMatch(/@test\.example\.com$/);
  });

  it('buildVehicle VIN is exactly 17 chars', () => {
    const v = buildVehicle();
    expect(v.vin).toHaveLength(17);
  });

  it('overrides take precedence over defaults', () => {
    const d = buildDriver({ name: 'Override' });
    expect(d.name).toBe('Override');
    const l = buildLoad(42, { rateCents: 999900 });
    expect(l.rateCents).toBe(999900);
    expect(l.customerId).toBe(42);
  });
});
