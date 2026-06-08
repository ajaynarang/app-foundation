import { NotImplementedException } from '@nestjs/common';
import { TrimblePcMilerProvider } from '../providers/trimble-pcmiler.provider';

describe('TrimblePcMilerProvider', () => {
  let provider: TrimblePcMilerProvider;

  beforeEach(() => {
    provider = new TrimblePcMilerProvider();
  });

  describe('getRatedMiles', () => {
    it('should throw NotImplementedException', async () => {
      const origin = { latitude: 32.78, longitude: -96.8 };
      const destination = { latitude: 33.75, longitude: -84.39 };

      await expect(provider.getRatedMiles(origin, destination)).rejects.toThrow(NotImplementedException);
      await expect(provider.getRatedMiles(origin, destination)).rejects.toThrow(
        'Trimble PC*Miler integration coming in Phase 2',
      );
    });
  });

  describe('getTruckMiles', () => {
    it('should throw NotImplementedException', async () => {
      const origin = { latitude: 32.78, longitude: -96.8 };
      const destination = { latitude: 33.75, longitude: -84.39 };

      await expect(provider.getTruckMiles(origin, destination)).rejects.toThrow(NotImplementedException);
      await expect(provider.getTruckMiles(origin, destination)).rejects.toThrow(
        'Trimble PC*Miler integration coming in Phase 2',
      );
    });

    it('should throw NotImplementedException with truck profile', async () => {
      const origin = { latitude: 32.78, longitude: -96.8 };
      const destination = { latitude: 33.75, longitude: -84.39 };
      const profile = { hazmat: true };

      await expect(provider.getTruckMiles(origin, destination, profile)).rejects.toThrow(NotImplementedException);
    });
  });
});
