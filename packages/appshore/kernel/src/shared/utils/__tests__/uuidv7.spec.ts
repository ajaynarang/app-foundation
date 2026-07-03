import { generateUuidV7, uuidv7FromTimestamp } from '../uuidv7';

describe('UUIDv7', () => {
  it('generates a 36-char string with version nibble 7', () => {
    const u = generateUuidV7();
    expect(u).toHaveLength(36);
    expect(u[14]).toBe('7');
  });

  it('sorts lexicographically by generation time', async () => {
    const a = generateUuidV7();
    await new Promise((r) => setTimeout(r, 5));
    const b = generateUuidV7();
    expect(a < b).toBe(true);
  });

  it('reconstructs a UUIDv7 from a past timestamp that sorts before fresh ones', () => {
    const past = new Date('2024-01-01T00:00:00Z');
    const u = uuidv7FromTimestamp(past);
    expect(u[14]).toBe('7');
    expect(u < generateUuidV7()).toBe(true);
  });

  it('encodes the same timestamp into the same leading prefix', () => {
    const past = new Date('2024-01-01T00:00:00Z');
    const a = uuidv7FromTimestamp(past);
    const b = uuidv7FromTimestamp(past);
    expect(a.slice(0, 12)).toBe(b.slice(0, 12));
  });
});
