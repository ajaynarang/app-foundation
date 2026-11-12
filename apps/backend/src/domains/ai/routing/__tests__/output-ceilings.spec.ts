import { MIN_OUTPUT_CEILING, OUTPUT_CEILINGS } from '../output-ceilings';

describe('OUTPUT_CEILINGS', () => {
  it('leaves room for always-on thinking: no ceiling is below 1,024 tokens', () => {
    expect(MIN_OUTPUT_CEILING).toBe(1_024);
    for (const [name, value] of Object.entries(OUTPUT_CEILINGS)) {
      expect({ name, ok: value >= MIN_OUTPUT_CEILING }).toEqual({ name, ok: true });
    }
  });

  it('grows with the shape of the answer', () => {
    const order = ['WORD', 'VERDICT', 'SUMMARY', 'LIST', 'STEP', 'DOCUMENT'] as const;
    const values = order.map((k) => OUTPUT_CEILINGS[k]);
    expect([...values].sort((a, b) => a - b)).toEqual(values);
  });
});
