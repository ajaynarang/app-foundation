import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveDocsUrl } from '../docs-url';

describe('resolveDocsUrl', () => {
  it('returns the configured http(s) URL', () => {
    expect(resolveDocsUrl('https://docs.example.com/start')).toBe('https://docs.example.com/start');
    expect(resolveDocsUrl('  http://localhost:4000/  ')).toBe('http://localhost:4000/');
  });

  it.each([undefined, '', '   ', 'docs.example.com', '/docs', 'javascript:alert(1)', 'mailto:a@example.com'])(
    'returns null for %p, so the button is hidden',
    (raw) => {
      expect(resolveDocsUrl(raw)).toBeNull();
    },
  );
});

describe('landing page', () => {
  // A scaffolded product copies this file. A repository URL written here would
  // ship in every product as its "Documentation" link.
  it('names no repository of its own', () => {
    const source = readFileSync(join(__dirname, '../../../app/page.tsx'), 'utf8');
    expect(source).not.toMatch(/https?:\/\/(www\.)?(github|gitlab|bitbucket)\./);
    expect(source).toContain('NEXT_PUBLIC_DOCS_URL');
  });
});
