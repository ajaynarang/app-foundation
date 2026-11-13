import { toAnyTermQuery } from '../retrieval/text-query';

describe('toAnyTermQuery', () => {
  it('ORs the words of a question', () => {
    expect(toAnyTermQuery('How much for 12 seats?')).toBe('how | much | for | 12 | seats');
  });

  // Lexemes like "app.example:8080" fed back into to_tsquery
  // threw "syntax error in tsquery" and failed the whole search.
  it('drops tsquery operators and punctuation', () => {
    expect(toAnyTermQuery("app.example:8080 & !members' (pay) | <-> 'x'")).toBe(
      'app | example | 8080 | members | pay | x',
    );
  });

  // Passing already-stemmed lexemes to to_tsquery('english')
  // stemmed them twice ("agreed" → "agre" → "agr") and missed matches.
  it('passes raw words so Postgres stems each once', () => {
    expect(toAnyTermQuery('agreed')).toBe('agreed');
  });

  it('dedupes and keeps non-ASCII letters', () => {
    expect(toAnyTermQuery('Pay pay PAY café')).toBe('pay | café');
  });

  it('returns null when nothing searchable remains', () => {
    expect(toAnyTermQuery('?!: --')).toBeNull();
    expect(toAnyTermQuery('')).toBeNull();
  });

  it('caps very long inputs', () => {
    const many = Array.from({ length: 100 }, (_, i) => `w${i}`).join(' ');
    expect(toAnyTermQuery(many)?.split(' | ')).toHaveLength(32);
  });
});
