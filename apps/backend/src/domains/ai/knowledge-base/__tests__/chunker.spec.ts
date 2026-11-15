import { chunkMarkdown, formatChunk } from '../content/chunker';

const sentence = (n: number) => `Sentence number ${n} describes one thing about the product.`;
const paragraph = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => sentence(from + i)).join(' ');

describe('chunkMarkdown', () => {
  it('returns nothing for empty input', () => {
    expect(chunkMarkdown('')).toEqual([]);
    expect(chunkMarkdown('   \n\n  ')).toEqual([]);
  });

  it('keeps a short document as one chunk with no section', () => {
    expect(chunkMarkdown('The platform is a starter.')).toEqual([
      { section: null, text: 'The platform is a starter.' },
    ]);
  });

  // Regression: the old chunker advanced one character at a time once a chunk
  // reached the end of the text, storing ~100 junk tails (")", "s)", "ts)").
  it('never emits tiny tail fragments for long text', () => {
    const body = paragraph(1, 120);
    const chunks = chunkMarkdown(body, { maxChars: 1000, overlapChars: 100, minChars: 200 });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.length).toBeLessThan(15);
    for (const c of chunks) {
      expect(c.text.length).toBeGreaterThanOrEqual(200);
      expect(c.text.length).toBeLessThanOrEqual(1000 + 200);
    }
    // Every sentence survives chunking.
    const joined = chunks.map((c) => c.text).join(' ');
    for (let i = 1; i <= 120; i++) expect(joined).toContain(sentence(i));
  });

  it('splits on headings so a chunk never straddles two topics', () => {
    const md = ['Intro text.', '## Pricing', 'Pricing depends on team size.', '## Support', 'Email support.'].join(
      '\n',
    );
    expect(chunkMarkdown(md)).toEqual([
      { section: null, text: 'Intro text.' },
      { section: 'Pricing', text: 'Pricing depends on team size.' },
      { section: 'Support', text: 'Email support.' },
    ]);
  });

  it('nests ### under the current ## and treats # as the document title', () => {
    const md = ['# Billing', 'Overview.', '## Team billing', 'Basics.', '### Proration', 'Changes prorate.'].join('\n');
    expect(chunkMarkdown(md).map((c) => c.section)).toEqual([null, 'Team billing', 'Team billing › Proration']);
  });

  it('ignores # lines inside fenced code blocks', () => {
    const md = ['## Setup', '```bash', '# install', 'pnpm i', '```', 'Done.'].join('\n');
    const chunks = chunkMarkdown(md);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].section).toBe('Setup');
    expect(chunks[0].text).toContain('# install');
  });

  it('packs paragraphs and carries overlap between chunks of the same section', () => {
    const md = `## Routing\n\n${paragraph(1, 10)}\n\n${paragraph(11, 10)}\n\n${paragraph(21, 10)}`;
    const chunks = chunkMarkdown(md, { maxChars: 700, overlapChars: 80, minChars: 100 });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.section === 'Routing')).toBe(true);
    const lastWordsOfFirst = chunks[0].text.slice(-30);
    expect(chunks[1].text).toContain(lastWordsOfFirst.trim().split(' ').slice(-2).join(' '));
  });

  it('hard-splits a single run with no boundaries without looping', () => {
    const chunks = chunkMarkdown('x'.repeat(5000), { maxChars: 1000, overlapChars: 0, minChars: 0 });
    expect(chunks.map((c) => c.text.length)).toEqual([1000, 1000, 1000, 1000, 1000]);
  });

  it('merges a short trailing piece into the previous chunk', () => {
    const md = `${paragraph(1, 18)}\n\nShort tail.`;
    const chunks = chunkMarkdown(md, { maxChars: 1000, overlapChars: 0, minChars: 200 });
    expect(chunks[chunks.length - 1].text.endsWith('Short tail.')).toBe(true);
    expect(chunks[chunks.length - 1].text.length).toBeGreaterThan(200);
  });
  // merging a short tail used to re-append the overlap the
  // tail had copied from the previous chunk, duplicating ~150 chars.
  it('merges a short tail without duplicating the overlap', () => {
    // Unique tokens, ~1,180 chars per paragraph: each fills a chunk on its own.
    const paragraphOf = (prefix: string) => {
      const tokens: string[] = [];
      for (let i = 0; tokens.join(' ').length < 1170; i++) tokens.push(`${prefix}${i}`);
      return tokens.join(' ');
    };
    const md = `${paragraphOf('a')}\n\n${paragraphOf('b')}\n\nTiny.`;
    const chunks = chunkMarkdown(md, { maxChars: 1200, overlapChars: 150, minChars: 200 });

    const last = chunks[chunks.length - 1].text;
    expect(last.endsWith('Tiny.')).toBe(true);
    for (const chunk of chunks) {
      const tokens = chunk.text.split(/\s+/);
      expect(new Set(tokens).size).toBe(tokens.length);
    }
  });

  it('keeps every chunk within maxChars except a merged tail', () => {
    const md = Array.from({ length: 6 }, (_, i) => `${'w'.repeat(5)} `.repeat(198) + `p${i}.`).join('\n\n');
    const chunks = chunkMarkdown(md, { maxChars: 1200, overlapChars: 150, minChars: 200 });
    for (const chunk of chunks) expect(chunk.text.length).toBeLessThanOrEqual(1200 + 200 + 2);
    expect(chunks.slice(0, -1).every((c) => c.text.length <= 1200)).toBe(true);
  });

  it('only closes a fence with the marker that opened it', () => {
    const md = ['## Setup', '~~~', '```', '## not a heading', '~~~', '## Next', 'Body.'].join('\n');
    expect(chunkMarkdown(md).map((c) => c.section)).toEqual(['Setup', 'Next']);
  });

  it('caps the section path to the column width', () => {
    const md = `## ${'h'.repeat(200)}\n\n### ${'s'.repeat(200)}\n\nBody.`;
    const [chunk] = chunkMarkdown(md);
    expect(chunk.section?.length).toBe(255);
  });
});

describe('formatChunk', () => {
  it('prefixes the title and section', () => {
    expect(formatChunk('Billing', 'Team billing', 'Body.')).toBe('Billing › Team billing\n\nBody.');
  });

  it('uses the title alone when there is no section', () => {
    expect(formatChunk('Billing', null, 'Body.')).toBe('Billing\n\nBody.');
  });
});
