import {
  AutocompleteQuerySchema,
  AutocompleteResponseSchema,
  PlaceSuggestionSchema,
  PlacesProviderSchema,
} from '../places.schema';

describe('PlacesProviderSchema', () => {
  it.each(['here', 'google', 'smarty'] as const)('accepts %s', (v) => {
    expect(() => PlacesProviderSchema.parse(v)).not.toThrow();
  });

  it('rejects unknown provider', () => {
    expect(() => PlacesProviderSchema.parse('mapbox')).toThrow();
  });
});

describe('PlaceSuggestionSchema', () => {
  it('parses a complete suggestion with inline lat/lon', () => {
    const parsed = PlaceSuggestionSchema.parse({
      externalId: 'here:af:abc123',
      text: '1245 Industrial Blvd, Dallas, TX 75207',
      street: '1245 Industrial Blvd',
      city: 'Dallas',
      state: 'TX',
      zipCode: '75207',
      lat: 32.7767,
      lon: -96.797,
      provider: 'here',
    });
    expect(parsed.externalId).toBe('here:af:abc123');
    expect(parsed.lat).toBe(32.7767);
  });

  it('accepts a minimal suggestion without address parts', () => {
    const parsed = PlaceSuggestionSchema.parse({
      externalId: 'x',
      text: 'Walmart DC',
      provider: 'here',
    });
    expect(parsed.city).toBeUndefined();
    expect(parsed.lat).toBeUndefined();
  });

  it('rejects an empty externalId', () => {
    expect(() =>
      PlaceSuggestionSchema.parse({
        externalId: '',
        text: 'x',
        provider: 'here',
      }),
    ).toThrow();
  });

  it('rejects unknown provider', () => {
    expect(() =>
      PlaceSuggestionSchema.parse({
        externalId: 'x',
        text: 'x',
        provider: 'mapbox',
      }),
    ).toThrow();
  });
});

describe('AutocompleteQuerySchema', () => {
  it('accepts a minimal query with q only', () => {
    const parsed = AutocompleteQuerySchema.parse({ q: 'walmart' });
    expect(parsed.q).toBe('walmart');
    expect(parsed.country).toBeUndefined();
  });

  it('trims surrounding whitespace on q', () => {
    const parsed = AutocompleteQuerySchema.parse({ q: '  walmart  ' });
    expect(parsed.q).toBe('walmart');
  });

  it('rejects q shorter than 3 chars (after trim)', () => {
    expect(() => AutocompleteQuerySchema.parse({ q: 'ab' })).toThrow();
    expect(() => AutocompleteQuerySchema.parse({ q: '   ab   ' })).toThrow();
  });

  it('rejects q longer than 120 chars', () => {
    expect(() => AutocompleteQuerySchema.parse({ q: 'a'.repeat(121) })).toThrow();
  });

  it('rejects non-US country', () => {
    expect(() => AutocompleteQuerySchema.parse({ q: 'walmart', country: 'CA' })).toThrow();
  });

  it('rejects limit > 10', () => {
    expect(() => AutocompleteQuerySchema.parse({ q: 'walmart', limit: 11 })).toThrow();
  });

  it('rejects limit < 1', () => {
    expect(() => AutocompleteQuerySchema.parse({ q: 'walmart', limit: 0 })).toThrow();
  });

  it('rejects non-integer limit', () => {
    expect(() => AutocompleteQuerySchema.parse({ q: 'walmart', limit: 3.5 })).toThrow();
  });
});

describe('AutocompleteResponseSchema', () => {
  it('parses an empty results array', () => {
    const parsed = AutocompleteResponseSchema.parse({ results: [] });
    expect(parsed.results).toEqual([]);
  });

  it('parses a results array with one suggestion', () => {
    const parsed = AutocompleteResponseSchema.parse({
      results: [
        {
          externalId: 'here:af:abc',
          text: 'Walmart DC #6094',
          provider: 'here',
        },
      ],
    });
    expect(parsed.results).toHaveLength(1);
  });

  it('rejects a results entry with bad provider', () => {
    expect(() =>
      AutocompleteResponseSchema.parse({
        results: [{ externalId: 'x', text: 'x', provider: 'bad' }],
      }),
    ).toThrow();
  });
});
