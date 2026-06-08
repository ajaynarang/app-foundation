import { detectScrambledLayout } from '../ratecon-layout-detector';

describe('detectScrambledLayout', () => {
  // ── Scrambled layouts — load label present, value severed ────────────
  // Real signature from the SQ-119 Value Industry ratecon: the load value
  // (62988) sits bare at the top while the "PRO #" label is stranded near the
  // footer, detached from any digit.
  describe('scrambled "FROM / CARRIER" broker forms', () => {
    it('flags the SQ-119 layout (bare value at top, "PRO #" label orphaned at footer)', () => {
      const text = [
        '62988',
        '62988 06/02/26 12:54:04 (EST)',
        'VALUE INDUSTRY (617) 764-6674 (f)',
        '252 DOREMUS AVE 1581811', // MC# value glued to an address line
        '4130912', // DOT# value, bare
        'NEWARK NJ 07105 OSCAR (978) 885-6169',
        // ...labels stranded at the bottom of the stream, no digits adjacent:
        'PRO # Rate Confirmation',
        'MC #',
        'DOT',
        'Send Carrier Bills to the Address Above PRO # must appear on all Invoices',
      ].join('\n');

      const result = detectScrambledLayout(text);

      expect(result.isScrambled).toBe(true);
      expect(result.loadLabelCount).toBeGreaterThan(0);
      expect(result.boundLabelCount).toBe(0);
    });

    it('flags an orphaned label sitting directly above a numeric address/MC# row', () => {
      // The value on the NEXT line is an address + MC#, not the load number.
      // A line-spanning window would falsely read this as "bound"; the same-line
      // clip keeps it correctly classified as scrambled.
      const text = 'PRO #\n252 DOREMUS AVE 1581811\n4130912 NEWARK NJ';
      const result = detectScrambledLayout(text);

      expect(result.isScrambled).toBe(true);
      expect(result.boundLabelCount).toBe(0);
    });

    it('flags an orphaned "REFERENCE #" header label (Brentwood / American Logistics form)', () => {
      const text = [
        '358392', // real load number, bare at top
        '68 SOUTH SERVICE RD SUITE 100 1581811', // MC# glued to address
        '4130912',
        // header label row, values live in a detached column:
        'TYPE  REFERENCE #  TYPE  REFERENCE #  TYPE  REFERENCE #',
        'PICK 1',
      ].join('\n');

      expect(detectScrambledLayout(text).isScrambled).toBe(true);
    });
  });

  // ── Healthy layouts — load label bound to its value ──────────────────
  describe('well-linearized layouts (must stay on text-first)', () => {
    it('does NOT flag "Load # 8481647" (value adjacent to label)', () => {
      const text = 'Carrier Rate Confirmation\nLoad # 8481647\nRate: $1,150.00\nPickup: Dallas TX';
      const result = detectScrambledLayout(text);

      expect(result.isScrambled).toBe(false);
      expect(result.boundLabelCount).toBe(1);
    });

    it('does NOT flag "PRO # 370503" with the value on the same line', () => {
      expect(detectScrambledLayout('PRO # 370503\nBroker: American Logistics').isScrambled).toBe(false);
    });

    it('does NOT flag when at least one occurrence is bound, even if others are not', () => {
      // A boilerplate "PRO # must appear on all invoices" can leave a trailing
      // orphaned label — one bound occurrence is enough to trust the text layer.
      const text = 'PRO # 62988\nTotal: 1150.00\nPRO # must appear on all invoices';
      const result = detectScrambledLayout(text);

      expect(result.isScrambled).toBe(false);
      expect(result.boundLabelCount).toBe(1);
    });
  });

  // ── No load-number label — leave untouched ───────────────────────────
  describe('no load-number label present', () => {
    it('does NOT flag text with no load-number label at all', () => {
      const text = 'JY CARRIERS LLC\nMC # 1581811\nDOT # 4130912\nPickup: Newark NJ';
      const result = detectScrambledLayout(text);

      expect(result.isScrambled).toBe(false);
      expect(result.loadLabelCount).toBe(0);
    });

    it('does NOT flag empty text', () => {
      expect(detectScrambledLayout('').isScrambled).toBe(false);
    });
  });

  // ── Hygiene — module-level regex must not leak lastIndex across calls ─
  it('returns stable results across repeated calls (no shared regex state)', () => {
    const text = 'PRO #\nLoad #\nOrder #'; // all orphaned
    const first = detectScrambledLayout(text);
    const second = detectScrambledLayout(text);

    expect(first).toEqual(second);
    expect(first.isScrambled).toBe(true);
  });
});
