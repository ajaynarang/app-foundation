import { NotImplementedException } from '@nestjs/common';
import { SmartyPlacesProvider } from '../providers/smarty-places.provider';

describe('SmartyPlacesProvider', () => {
  it('throws NotImplementedException for autocomplete', async () => {
    const provider = new SmartyPlacesProvider();
    await expect(provider.autocomplete({ q: 'walmart' })).rejects.toThrow(NotImplementedException);
  });
});
