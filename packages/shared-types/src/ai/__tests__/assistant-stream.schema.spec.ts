import { CitationSchema } from '../assistant-stream.schema';

describe('CitationSchema', () => {
  const base = { sourceType: 'KNOWLEDGE_DOCUMENT', sourceId: 'kd_1', title: 'Getting started' };

  it('accepts a citation without an href, and one with an in-app path', () => {
    expect(CitationSchema.safeParse(base).success).toBe(true);
    expect(CitationSchema.safeParse({ ...base, href: '/settings/ai' }).success).toBe(true);
    expect(CitationSchema.safeParse({ ...base, href: '/' }).success).toBe(true);
  });

  it.each(['//evil.example', '/\\evil.example', 'https://evil.example', 'javascript:alert(1)', 'settings'])(
    'refuses an href that leaves the app: %s',
    (href) => {
      expect(CitationSchema.safeParse({ ...base, href }).success).toBe(false);
    },
  );
});
