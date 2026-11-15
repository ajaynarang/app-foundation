import { BadRequestException } from '@nestjs/common';
import {
  MAX_LIST_SEARCH_LENGTH,
  parseDateBound,
  parseEnumList,
  parseEnumValue,
  parseNamedSort,
  parseSearchTerm,
  normalizeSearchTerm,
  escapeLike,
  containsText,
  parseSingleValue,
  isStorableDate,
  hasControlCharacters,
} from '../list-query';

describe('list query parsers', () => {
  const SORTS = ['newest', 'oldest'] as const;
  const STATUSES = ['RECEIVED', 'TRIAGING', 'TRIAGED'] as const;

  describe('parseNamedSort', () => {
    it('falls back to the default when omitted or empty', () => {
      expect(parseNamedSort(undefined, SORTS, 'newest')).toBe('newest');
      expect(parseNamedSort('', SORTS, 'newest')).toBe('newest');
    });

    it('accepts a whitelisted name', () => {
      expect(parseNamedSort('oldest', SORTS, 'newest')).toBe('oldest');
    });

    it('rejects anything off the whitelist with a 400 — a column name is not a sort option', () => {
      expect(() => parseNamedSort('createdAt', SORTS, 'newest')).toThrow(BadRequestException);
      expect(() => parseNamedSort('newest; drop', SORTS, 'newest')).toThrow(BadRequestException);
    });
  });

  describe('parseEnumList', () => {
    it('returns undefined when there is nothing to filter on', () => {
      expect(parseEnumList(undefined, STATUSES)).toBeUndefined();
      expect(parseEnumList('', STATUSES)).toBeUndefined();
      expect(parseEnumList(' , ', STATUSES)).toBeUndefined();
    });

    it('splits, trims and de-duplicates comma-joined values', () => {
      expect(parseEnumList('RECEIVED, TRIAGING,RECEIVED', STATUSES)).toEqual(['RECEIVED', 'TRIAGING']);
    });

    it('rejects an unknown value with a 400 naming the filter', () => {
      expect(() => parseEnumList('RECEIVED,BOGUS', STATUSES, 'status')).toThrow('Unknown status value');
      expect(() => parseEnumList('received', STATUSES)).toThrow(BadRequestException);
    });
  });

  describe('parseEnumValue', () => {
    it('returns undefined when omitted or empty', () => {
      expect(parseEnumValue(undefined, STATUSES)).toBeUndefined();
      expect(parseEnumValue('', STATUSES)).toBeUndefined();
    });

    it('accepts a known value and rejects an unknown one with a 400', () => {
      expect(parseEnumValue('TRIAGED', STATUSES)).toBe('TRIAGED');
      expect(() => parseEnumValue('NOPE', STATUSES, 'source')).toThrow('Unknown source value');
    });
  });

  describe('parseDateBound', () => {
    it('returns undefined when omitted or empty', () => {
      expect(parseDateBound(undefined, 'from')).toBeUndefined();
      expect(parseDateBound('', 'to')).toBeUndefined();
    });

    it('reads an ISO instant as given', () => {
      expect(parseDateBound('2026-10-05T04:00:00.000Z', 'from')).toEqual(new Date('2026-10-05T04:00:00.000Z'));
    });

    it('reads a bare calendar date as an inclusive UTC day', () => {
      expect(parseDateBound('2026-10-05', 'from')).toEqual(new Date('2026-10-05T00:00:00.000Z'));
      expect(parseDateBound('2026-10-05', 'to')).toEqual(new Date('2026-10-05T23:59:59.999Z'));
    });

    it('rejects an unparseable date with a 400', () => {
      expect(() => parseDateBound('yesterday', 'from')).toThrow(BadRequestException);
      expect(() => parseDateBound('2026-13-45', 'to')).toThrow(BadRequestException);
    });

    // A valid JS Date the database cannot take — it would fail inside the query as a 500.
    it.each(['+275000-01-01T00:00:00Z', '+010000-01-01', '-200000-01-01T00:00:00Z', '0000-01-01'])(
      'rejects the out-of-range date %s with a 400',
      (value) => {
        expect(() => parseDateBound(value, 'from')).toThrow(BadRequestException);
        expect(() => parseDateBound(value, 'to')).toThrow(BadRequestException);
      },
    );

    it('accepts the first and last storable years', () => {
      expect(parseDateBound('0001-01-01', 'from')).toEqual(new Date('0001-01-01T00:00:00.000Z'));
      expect(parseDateBound('9999-12-31', 'to')).toEqual(new Date('9999-12-31T23:59:59.999Z'));
    });
  });

  describe('parseSearchTerm', () => {
    it('trims, and treats blank as no search', () => {
      expect(parseSearchTerm('  IN-0001 ')).toBe('IN-0001');
      expect(parseSearchTerm('   ')).toBeUndefined();
      expect(parseSearchTerm(undefined)).toBeUndefined();
    });

    it('turns control characters into spaces — a NUL byte fails a Postgres query', () => {
      expect(parseSearchTerm('a\u0000b')).toBe('a b');
      expect(parseSearchTerm('\u0000\u0000')).toBeUndefined();
      expect(parseSearchTerm('refund\tflow\n')).toBe('refund flow');
      expect(normalizeSearchTerm(' x\u0007\u007fy ')).toBe('x y');
      expect(normalizeSearchTerm(null)).toBeUndefined();
    });

    it('caps very long input', () => {
      expect(parseSearchTerm('x'.repeat(MAX_LIST_SEARCH_LENGTH + 50))).toHaveLength(MAX_LIST_SEARCH_LENGTH);
    });
  });

  // Express delivers a repeated key (`?q=a&q=b`) as an array, whatever the controller's type says.
  describe('a repeated query key (array input)', () => {
    const twice = ['a', 'b'];

    it('reads a repeated enum-list key like the comma-joined form', () => {
      expect(parseEnumList(['RECEIVED', 'TRIAGING,TRIAGED', 'RECEIVED'], STATUSES, 'status')).toEqual([
        'RECEIVED',
        'TRIAGING',
        'TRIAGED',
      ]);
      expect(() => parseEnumList(['RECEIVED', 'BOGUS'], STATUSES, 'status')).toThrow(BadRequestException);
      expect(() => parseEnumList([{ nested: 'x' }] as unknown as string[], STATUSES, 'status')).toThrow(
        BadRequestException,
      );
    });

    it.each([
      ['parseSearchTerm', () => parseSearchTerm(twice)],
      ['parseNamedSort', () => parseNamedSort(twice, SORTS, 'newest')],
      ['parseEnumValue', () => parseEnumValue(twice, STATUSES, 'status')],
      ['parseDateBound', () => parseDateBound(['2026-09-01', '2026-09-02'], 'from')],
      ['a non-string value', () => parseSearchTerm({ nested: 'x' } as unknown as string)],
    ])('%s answers with a 400, never a TypeError', (_label, parse) => {
      expect(parse).toThrow(BadRequestException);
    });
  });

  describe('escapeLike', () => {
    it('escapes the LIKE wildcards and the escape character itself', () => {
      expect(escapeLike('100%')).toBe('100\\%');
      expect(escapeLike('user_id')).toBe('user\\_id');
      expect(escapeLike('a\\b')).toBe('a\\\\b');
      expect(escapeLike('TL-42')).toBe('TL-42');
    });
  });

  describe('parseSingleValue', () => {
    it('passes one value through and reads empty as not set', () => {
      expect(parseSingleValue('wi_abc', 'cursor')).toBe('wi_abc');
      expect(parseSingleValue('', 'cursor')).toBeUndefined();
      expect(parseSingleValue(undefined, 'cursor')).toBeUndefined();
    });

    it('answers a repeated key with a 400', () => {
      expect(() => parseSingleValue(['a', 'b'], 'cursor')).toThrow(BadRequestException);
    });
  });

  describe('containsText', () => {
    it('builds a case-insensitive contains filter', () => {
      expect(containsText('TL-42')).toEqual({ contains: 'TL-42', mode: 'insensitive' });
    });

    it('treats % and _ as literal characters, not wildcards', () => {
      expect(containsText('100%')).toEqual({ contains: '100\\%', mode: 'insensitive' });
      expect(containsText('_')).toEqual({ contains: '\\_', mode: 'insensitive' });
    });
  });

  describe('isStorableDate / hasControlCharacters', () => {
    it('accepts years 0001–9999 only', () => {
      expect(isStorableDate(new Date('2026-10-05T00:00:00Z'))).toBe(true);
      expect(isStorableDate(new Date('+010000-01-01T00:00:00Z'))).toBe(false);
      expect(isStorableDate(new Date('nope'))).toBe(false);
    });

    it('spots a control character', () => {
      expect(hasControlCharacters('wi_\u0000')).toBe(true);
      expect(hasControlCharacters('wi_abc')).toBe(false);
    });
  });
});

describe('list-query errors carry fieldErrors ', () => {
  const fieldsOf = (fn: () => unknown) => {
    try {
      fn();
    } catch (e) {
      return (e as BadRequestException).getResponse();
    }
    throw new Error('expected a throw');
  };

  it.each([
    ['sort', () => parseNamedSort('createdAt', ['newest'] as const, 'newest')],
    ['status', () => parseEnumList('BOGUS', ['OPEN'] as const, 'status')],
    ['source', () => parseEnumValue('NOPE', ['EMAIL'] as const, 'source')],
    ['from', () => parseDateBound('yesterday', 'from')],
    ['cursor', () => parseSingleValue(['a', 'b'], 'cursor')],
  ])('%s', (field, fn) => {
    expect(fieldsOf(fn)).toMatchObject({ code: 'VALIDATION_FAILED', fieldErrors: { [field]: expect.any(String) } });
  });
});
