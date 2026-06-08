import { getMentionFragment, buildMentionText } from '../mention';
import type { SearchApiResult } from '@/shared/lib/search';

describe('getMentionFragment', () => {
  const at = (value: string, caret = value.length) => getMentionFragment(value, caret);

  it('detects a fragment after @ at string start', () => {
    expect(at('@wal')).toEqual({ at: 0, query: 'wal' });
  });
  it('detects a fragment after whitespace', () => {
    expect(at('show me @wal')).toEqual({ at: 8, query: 'wal' });
  });
  it('returns null for a mid-word @ (email)', () => {
    expect(at('email me@host.com')).toBeNull();
  });
  it('returns null when whitespace follows the @ token', () => {
    expect(at('show me @wal more')).toBeNull();
  });
  it('detects a bare @ (empty query)', () => {
    expect(at('show me @')).toEqual({ at: 8, query: '' });
  });
  it('uses caret position, not end of string', () => {
    expect(getMentionFragment('@wal more', 4)).toEqual({ at: 0, query: 'wal' });
  });
  it('returns null when there is no @', () => {
    expect(at('show me loads')).toBeNull();
  });
});

describe('buildMentionText', () => {
  const r = (over: Partial<SearchApiResult>): SearchApiResult => ({
    type: 'load',
    id: 'X',
    label: 'X',
    description: '',
    href: '',
    ...over,
  });

  it('load with ref → load <id> (<ref>)', () => {
    expect(buildMentionText(r({ type: 'load', id: 'LD-2026-001', referenceNumber: 'PO-88421' }))).toBe(
      'load LD-2026-001 (PO-88421)',
    );
  });
  it('load without ref → load <id>', () => {
    expect(buildMentionText(r({ type: 'load', id: 'LD-2026-001' }))).toBe('load LD-2026-001');
  });
  it('driver → driver <label>', () => {
    expect(buildMentionText(r({ type: 'driver', id: 'DRV-1', label: 'Mike Rodriguez' }))).toBe('driver Mike Rodriguez');
  });
  it('customer → customer <label>', () => {
    expect(buildMentionText(r({ type: 'customer', label: 'Walmart Distribution' }))).toBe(
      'customer Walmart Distribution',
    );
  });
  it('invoice → invoice <id>', () => {
    expect(buildMentionText(r({ type: 'invoice', id: 'INV-8821', label: 'INV-8821' }))).toBe('invoice INV-8821');
  });
  it('settlement → settlement <id>', () => {
    expect(buildMentionText(r({ type: 'settlement', id: 'STL-2026-014', label: 'STL-2026-014' }))).toBe(
      'settlement STL-2026-014',
    );
  });
  it('vehicle → unit <unitNumber> (stripped from label)', () => {
    expect(buildMentionText(r({ type: 'vehicle', id: 'VEH-1', label: 'Unit 204' }))).toBe('unit 204');
  });
  it('trip → trip <id>', () => {
    expect(buildMentionText(r({ type: 'trip', id: 'TRIP-0308-001', label: 'TRIP-0308-001' }))).toBe(
      'trip TRIP-0308-001',
    );
  });
  it('trailer → trailer <id>', () => {
    expect(buildMentionText(r({ type: 'trailer', id: 'TR-28', label: 'TR-28' }))).toBe('trailer TR-28');
  });
  it('lane → lane "<name>"', () => {
    expect(buildMentionText(r({ type: 'lane', id: 'Walmart Denver', label: 'Walmart Denver' }))).toBe(
      'lane "Walmart Denver"',
    );
  });
  it('unknown type falls back to the label', () => {
    expect(buildMentionText(r({ type: 'mystery', label: 'Thing' }))).toBe('Thing');
  });
});
