// Demo Data Engine — Real Boston-Region Commercial Addresses

export interface DemoAddress {
  address: string;
  city: string;
  state: string;
  zip: string;
  lat: number;
  lng: number;
}

/**
 * Map of city keys to real commercial/industrial addresses with coordinates.
 * Each city has 2-3 addresses for variety.
 */
export const DEMO_ADDRESSES: Record<string, DemoAddress[]> = {
  'Boston, MA': [
    { address: '100 Produce Market', city: 'Boston', state: 'MA', zip: '02118', lat: 42.334, lng: -71.0645 },
    { address: '1 Black Falcon Ave', city: 'Boston', state: 'MA', zip: '02210', lat: 42.3445, lng: -71.0338 },
    { address: '400 Terminal St', city: 'Boston', state: 'MA', zip: '02129', lat: 42.3867, lng: -71.0531 },
  ],
  'New York, NY': [
    { address: '1 Hunts Point Ave', city: 'Bronx', state: 'NY', zip: '10474', lat: 40.8186, lng: -73.8864 },
    { address: '220 Food Center Dr', city: 'Bronx', state: 'NY', zip: '10474', lat: 40.8115, lng: -73.876 },
    { address: '380 Edison Ave', city: 'Bronx', state: 'NY', zip: '10474', lat: 40.8142, lng: -73.8832 },
  ],
  'Hartford, CT': [
    { address: '100 Leibert Rd', city: 'Hartford', state: 'CT', zip: '06120', lat: 41.7849, lng: -72.6618 },
    { address: '20 Jennings Rd', city: 'Hartford', state: 'CT', zip: '06120', lat: 41.7833, lng: -72.655 },
  ],
  'Providence, RI': [
    { address: '300 Allens Ave', city: 'Providence', state: 'RI', zip: '02905', lat: 41.807, lng: -71.399 },
    { address: '85 Industrial Cir', city: 'Providence', state: 'RI', zip: '02907', lat: 41.794, lng: -71.426 },
  ],
  'Manchester, NH': [
    { address: '100 Kosciuszko St', city: 'Manchester', state: 'NH', zip: '03101', lat: 42.9856, lng: -71.4548 },
    { address: '55 Industrial Park Dr', city: 'Manchester', state: 'NH', zip: '03109', lat: 42.962, lng: -71.433 },
  ],
  'Portland, ME': [
    { address: '340 Commercial St', city: 'Portland', state: 'ME', zip: '04101', lat: 43.6575, lng: -70.2535 },
    { address: '100 Midland Cutoff', city: 'Portland', state: 'ME', zip: '04102', lat: 43.659, lng: -70.298 },
  ],
  'Worcester, MA': [
    { address: '135 Gold Star Blvd', city: 'Worcester', state: 'MA', zip: '01606', lat: 42.3017, lng: -71.8375 },
    { address: '35 Millbrook St', city: 'Worcester', state: 'MA', zip: '01606', lat: 42.2983, lng: -71.8312 },
  ],
  'New Bedford, MA': [
    { address: '52 Hassey St', city: 'New Bedford', state: 'MA', zip: '02740', lat: 41.6402, lng: -70.9309 },
    { address: '98 N Front St', city: 'New Bedford', state: 'MA', zip: '02740', lat: 41.6356, lng: -70.9216 },
  ],
  'Hyannis, MA': [
    { address: '50 Enterprise Rd', city: 'Hyannis', state: 'MA', zip: '02601', lat: 41.6688, lng: -70.294 },
    { address: '200 Iyannough Rd', city: 'Hyannis', state: 'MA', zip: '02601', lat: 41.6532, lng: -70.3015 },
  ],
  'Plymouth, MA': [
    { address: '100 Industrial Park Rd', city: 'Plymouth', state: 'MA', zip: '02360', lat: 41.913, lng: -70.736 },
    { address: '60 Commerce Way', city: 'Plymouth', state: 'MA', zip: '02360', lat: 41.9155, lng: -70.728 },
  ],
};

/**
 * Returns a random address for a city key, using the provided RNG.
 */
export function getAddress(cityKey: string, rng: () => number): DemoAddress {
  const addresses = DEMO_ADDRESSES[cityKey];
  if (!addresses || addresses.length === 0) {
    throw new Error(`No addresses found for city: ${cityKey}`);
  }
  return addresses[Math.floor(rng() * addresses.length)];
}
