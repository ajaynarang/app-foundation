import { NotImplementedException } from '@nestjs/common';
import { GooglePlacesProvider } from '../providers/google-places.provider';

describe('GooglePlacesProvider', () => {
  it('throws NotImplementedException for autocomplete', async () => {
    const provider = new GooglePlacesProvider();
    await expect(provider.autocomplete({ q: 'walmart' })).rejects.toThrow(NotImplementedException);
  });
});
