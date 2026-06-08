import { HereAutosuggestProvider } from '../providers/here-autosuggest.provider';
import { PlatformServicesConfig } from '../../platform-services.config';

const SAMPLE_HERE_RESPONSE = {
  items: [
    {
      id: 'here:af:streetsection:abc',
      title: '1245 Industrial Blvd, Dallas, TX 75207, United States',
      address: {
        label: '1245 Industrial Blvd, Dallas, TX 75207-3504, United States',
        street: '1245 Industrial Blvd',
        city: 'Dallas',
        stateCode: 'TX',
        postalCode: '75207-3504',
        countryCode: 'USA',
      },
      position: { lat: 32.7767, lng: -96.797 },
      resultType: 'houseNumber',
    },
    {
      id: 'here:af:place:def',
      title: 'Walmart Distribution Center',
      address: {
        label: 'Walmart DC #6094, Bentonville, AR 72712, United States',
        city: 'Bentonville',
        stateCode: 'AR',
        postalCode: '72712',
        countryCode: 'USA',
      },
      position: { lat: 36.3729, lng: -94.2088 },
      resultType: 'place',
    },
    // Non-US item that should be filtered out
    {
      id: 'here:af:place:zzz',
      title: 'Walmart Toronto',
      address: {
        label: 'Walmart, Toronto, Canada',
        city: 'Toronto',
        countryCode: 'CAN',
      },
      position: { lat: 43.65, lng: -79.38 },
      resultType: 'place',
    },
  ],
};

function buildProvider(apiKey: string | undefined | null = 'test-key') {
  const key = apiKey === null ? undefined : apiKey;
  const config = {
    places: { provider: 'here', apiKey: key, configured: !!key },
  } as unknown as PlatformServicesConfig;
  return new HereAutosuggestProvider(config);
}

describe('HereAutosuggestProvider', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns mapped US-only suggestions on a successful response', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => SAMPLE_HERE_RESPONSE,
    } as unknown as Response);

    const provider = buildProvider();
    const results = await provider.autocomplete({ q: 'walmart' });

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      externalId: 'here:af:streetsection:abc',
      city: 'Dallas',
      state: 'TX',
      zipCode: '75207',
      lat: 32.7767,
      lon: -96.797,
      provider: 'here',
    });
    expect(results[0].street).toBe('1245 Industrial Blvd');
  });

  it('forwards q, country, limit, and sessionToken to the HERE URL', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    } as unknown as Response);

    const provider = buildProvider();
    await provider.autocomplete({ q: 'walmart', country: 'US', limit: 7, sessionToken: 'sess-1' });

    const [calledUrl] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const url = new URL(calledUrl);
    expect(url.searchParams.get('q')).toBe('walmart');
    expect(url.searchParams.get('in')).toBe('countryCode:USA');
    expect(url.searchParams.get('limit')).toBe('7');
    expect(url.searchParams.get('apiKey')).toBe('test-key');
    expect(url.searchParams.get('sessionToken')).toBe('sess-1');
  });

  it('returns empty array when API key is missing', async () => {
    const provider = buildProvider(null);
    const results = await provider.autocomplete({ q: 'walmart' });
    expect(results).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns empty array on non-OK HTTP response', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      json: async () => ({}),
    } as unknown as Response);

    const provider = buildProvider();
    const results = await provider.autocomplete({ q: 'walmart' });
    expect(results).toEqual([]);
  });

  it('returns empty array on network error', async () => {
    fetchSpy.mockRejectedValue(new Error('ECONNRESET'));
    const provider = buildProvider();
    const results = await provider.autocomplete({ q: 'walmart' });
    expect(results).toEqual([]);
  });

  it('uses default limit of 5 when none provided', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    } as unknown as Response);

    const provider = buildProvider();
    await provider.autocomplete({ q: 'walmart' });
    const [calledUrl] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(new URL(calledUrl).searchParams.get('limit')).toBe('5');
  });

  it('handles items without address gracefully', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: 'here:af:loc:1',
            title: 'Some place',
            position: { lat: 33, lng: -100 },
            resultType: 'place',
          },
        ],
      }),
    } as unknown as Response);

    const provider = buildProvider();
    const results = await provider.autocomplete({ q: 'walmart' });

    expect(results).toHaveLength(1);
    expect(results[0].city).toBeUndefined();
    expect(results[0].state).toBeUndefined();
    expect(results[0].lat).toBe(33);
  });

  it('strips ZIP+4 suffix down to 5-digit postal code', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => SAMPLE_HERE_RESPONSE,
    } as unknown as Response);

    const provider = buildProvider();
    const results = await provider.autocomplete({ q: 'walmart' });
    expect(results[0].zipCode).toBe('75207');
  });
});
