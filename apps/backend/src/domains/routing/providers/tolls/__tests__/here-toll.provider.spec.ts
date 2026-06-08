import { ConfigService } from '@nestjs/config';
import { HereTollProvider } from '../here-toll.provider';
import { LatLon } from '../../routing/routing-provider.interface';

const waypoints: LatLon[] = [
  { lat: 32.7767, lon: -96.797 },
  { lat: 29.7604, lon: -95.3698 },
];

function providerWithKey(key: string | undefined): HereTollProvider {
  const config = { get: (k: string) => (k === 'hereTollsApiKey' ? key : undefined) } as unknown as ConfigService;
  return new HereTollProvider(config);
}

describe('HereTollProvider', () => {
  describe('without a tolls subscription key', () => {
    it('returns NOT_AVAILABLE with a null value — never a fabricated $0', async () => {
      const provider = providerWithKey(undefined);
      const result = await provider.estimateRouteToll(waypoints);

      expect(result.source).toBe('NOT_AVAILABLE');
      expect(result.value).toBeNull();
      expect(result.note).toMatch(/connect a here tolls/i);
    });

    it('does not attempt a network call when no key is configured', async () => {
      const provider = providerWithKey('');
      // No axios mock set up — if it tried to call out, this would reject/throw.
      const result = await provider.estimateRouteToll(waypoints);
      expect(result.source).toBe('NOT_AVAILABLE');
    });
  });

  describe('with fewer than two waypoints', () => {
    it('returns NOT_AVAILABLE', async () => {
      const provider = providerWithKey('test-key');
      const result = await provider.estimateRouteToll([waypoints[0]]);
      expect(result.source).toBe('NOT_AVAILABLE');
    });
  });

  describe('sumTollSections', () => {
    it('sums fares across sections and converts dollars to cents', () => {
      const provider = providerWithKey('test-key');
      const route = {
        sections: [
          { tolls: [{ fares: [{ price: { value: 12.5 } }, { price: { value: 3.25 } }] }] },
          { tolls: [{ fares: [{ price: { value: 4.0 } }] }] },
        ],
      };
      // 12.50 + 3.25 + 4.00 = 19.75 → 1975 cents
      expect((provider as any).sumTollSections(route)).toBe(1975);
    });

    it('returns 0 for a route with no toll sections', () => {
      const provider = providerWithKey('test-key');
      expect((provider as any).sumTollSections({ sections: [{}] })).toBe(0);
    });
  });
});
