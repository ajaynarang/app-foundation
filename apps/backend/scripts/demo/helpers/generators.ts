// Demo Data Engine — Deterministic Generators
import seedrandom from 'seedrandom';

/**
 * Creates a seeded RNG function that returns values in [0, 1).
 */
export function createRng(seed: string): () => number {
  return seedrandom(seed);
}

/**
 * Returns a random integer in [min, max] (inclusive), using the provided RNG.
 */
export function randomInt(min: number, max: number, rng: () => number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/**
 * Returns a random element from the array, using the provided RNG.
 */
export function randomElement<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * Generates a load number like NL-1XXXX from a sequence number.
 */
export function generateLoadNumber(seq: number): string {
  return `NL-${(10000 + seq).toString()}`;
}

/**
 * Generates a PO number from a format string, replacing '#' with random digits.
 */
export function generatePoNumber(format: string, rng: () => number): string {
  let result = '';
  for (const char of format) {
    if (char === '#') {
      result += Math.floor(rng() * 10).toString();
    } else {
      result += char;
    }
  }
  return result;
}

/**
 * Generates a BOL number like BOL-NL-1XXXX-P1 from load number and stop index.
 */
export function generateBolNumber(loadNumber: string, stopIndex: number): string {
  return `BOL-${loadNumber}-P${stopIndex}`;
}

/**
 * Generates an invoice number like NL-INV-1XXX from a sequence number.
 */
export function generateInvoiceNumber(seq: number): string {
  return `NL-INV-${(1000 + seq).toString()}`;
}

/**
 * Generates a settlement number like NL-SET-1XX from a sequence number.
 */
export function generateSettlementNumber(seq: number): string {
  return `NL-SET-${(100 + seq).toString()}`;
}

/**
 * Returns a random index based on weighted probabilities.
 * weights: array of positive numbers (relative weights).
 */
export function weightedRandomIndex(weights: number[], rng: () => number): number {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let random = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    random -= weights[i];
    if (random <= 0) return i;
  }
  return weights.length - 1;
}
