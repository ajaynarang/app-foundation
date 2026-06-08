import { NotImplementedException } from '@nestjs/common';
import { HereTrafficProvider } from '../providers/here-traffic.provider';

describe('HereTrafficProvider', () => {
  let provider: HereTrafficProvider;

  beforeEach(() => {
    provider = new HereTrafficProvider();
  });

  describe('getTrafficFlow', () => {
    it('should throw NotImplementedException', async () => {
      const waypoints = [
        { latitude: 32.78, longitude: -96.8 },
        { latitude: 33.75, longitude: -84.39 },
      ];

      await expect(provider.getTrafficFlow(waypoints)).rejects.toThrow(NotImplementedException);
      await expect(provider.getTrafficFlow(waypoints)).rejects.toThrow('HERE Traffic integration coming in Phase 2');
    });
  });

  describe('getIncidents', () => {
    it('should throw NotImplementedException', async () => {
      await expect(provider.getIncidents(32.78, -96.8, 10)).rejects.toThrow(NotImplementedException);
      await expect(provider.getIncidents(32.78, -96.8, 10)).rejects.toThrow(
        'HERE Traffic integration coming in Phase 2',
      );
    });
  });
});
