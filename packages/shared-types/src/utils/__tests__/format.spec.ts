import { formatLoadLabel, NO_PO_MARKER } from '../format';

describe('formatLoadLabel', () => {
  // Silence the dev-mode console.warn during these specs so the test output
  // stays clean. The warn behaviour itself has its own dedicated cases below.
  let warnSpy: jest.SpyInstance;
  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('joins load number and reference number with the divider when both are present', () => {
    expect(formatLoadLabel('LD-001', 'PO-12345')).toBe('#LD-001 · PO-12345');
  });

  it('trims surrounding whitespace from the reference number', () => {
    expect(formatLoadLabel('LD-001', '  PO-12345  ')).toBe('#LD-001 · PO-12345');
  });

  it('renders the no-PO marker when reference number is null', () => {
    expect(formatLoadLabel('LD-001', null)).toBe(`#LD-001 · ${NO_PO_MARKER}`);
  });

  it('renders the no-PO marker when reference number is undefined', () => {
    expect(formatLoadLabel('LD-001')).toBe(`#LD-001 · ${NO_PO_MARKER}`);
  });

  it('renders the no-PO marker when reference number is the empty string', () => {
    expect(formatLoadLabel('LD-001', '')).toBe(`#LD-001 · ${NO_PO_MARKER}`);
  });

  it('renders the no-PO marker when reference number is only whitespace', () => {
    expect(formatLoadLabel('LD-001', '   ')).toBe(`#LD-001 · ${NO_PO_MARKER}`);
  });

  it('warns once per load when PO is missing in dev mode (de-duped by loadNumber)', () => {
    // Two adjacent calls for the same load should only produce one warning.
    formatLoadLabel('LD-DEDUP-001', null);
    formatLoadLabel('LD-DEDUP-001', null);
    const calls = warnSpy.mock.calls.filter((args) => String(args[0]).includes('LD-DEDUP-001'));
    expect(calls).toHaveLength(1);
  });

  it('does not warn when a PO is present', () => {
    formatLoadLabel('LD-OK-001', 'PO-9');
    const calls = warnSpy.mock.calls.filter((args) => String(args[0]).includes('LD-OK-001'));
    expect(calls).toHaveLength(0);
  });
});
