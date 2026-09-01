import { escapeHtml } from '../escape-html';

describe('escapeHtml', () => {
  it('neutralises a tag so it renders as text', () => {
    expect(escapeHtml('<b>hi</b>')).toBe('&lt;b&gt;hi&lt;/b&gt;');
  });

  it('defuses the image-beacon vector an organizer could type into free text', () => {
    const escaped = escapeHtml('<img src=x onerror="fetch(\'https://evil.example\')">');
    expect(escaped).not.toContain('<img');
    expect(escaped).toContain('&lt;img');
  });

  it('escapes the attribute-breaking quotes', () => {
    expect(escapeHtml(`a"b'c`)).toBe('a&quot;b&#39;c');
  });

  it('escapes ampersands first so an entity is not double-decoded', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('leaves ordinary copy untouched', () => {
    expect(escapeHtml('Class cancelled — coach travelling')).toBe('Class cancelled — coach travelling');
  });

  it('accepts an absent value', () => {
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(null)).toBe('');
  });
});
