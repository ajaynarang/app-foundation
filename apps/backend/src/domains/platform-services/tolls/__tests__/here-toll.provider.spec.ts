import { NotImplementedException } from '@nestjs/common';
import { HereTollProvider } from '../providers/here-toll.provider';

describe('HereTollProvider', () => {
  let provider: HereTollProvider;

  beforeEach(() => {
    provider = new HereTollProvider();
  });

  describe('calculateRouteTolls', () => {
    it('should throw NotImplementedException', async () => {
      const waypoints = [
        { latitude: 32.78, longitude: -96.8 },
        { latitude: 33.75, longitude: -84.39 },
      ];

      await expect(provider.calculateRouteTolls(waypoints)).rejects.toThrow(NotImplementedException);
      await expect(provider.calculateRouteTolls(waypoints)).rejects.toThrow('HERE Toll integration coming in Phase 2');
    });

    it('should throw NotImplementedException with vehicle class', async () => {
      const waypoints = [
        { latitude: 32.78, longitude: -96.8 },
        { latitude: 33.75, longitude: -84.39 },
      ];

      await expect(provider.calculateRouteTolls(waypoints, 'CLASS_8')).rejects.toThrow(NotImplementedException);
    });
  });
});
