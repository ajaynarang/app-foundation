import { getMentionFragment, buildMentionText } from '../mention';
import type { SearchApiResult } from '@appshore/web-core/shared/lib/search';

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
    type: 'project',
    id: 'X',
    label: 'X',
    description: '',
    href: '',
    ...over,
  });

  it('prefixes the entity type before its label', () => {
    expect(buildMentionText(r({ type: 'project', label: 'Acme rollout' }))).toBe('project Acme rollout');
  });
  it('handles a different entity type', () => {
    expect(buildMentionText(r({ type: 'user', label: 'Jane Doe' }))).toBe('user Jane Doe');
  });
  it('falls back to the bare label when type is empty', () => {
    expect(buildMentionText(r({ type: '', label: 'Thing' }))).toBe('Thing');
  });
});
