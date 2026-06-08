import { Injectable, NotImplementedException } from '@nestjs/common';
import type { PlaceSuggestion } from '@sally/shared-types';
import type { AutocompleteParams, IPlacesProvider } from '../places-provider.interface';

@Injectable()
export class GooglePlacesProvider implements IPlacesProvider {
  autocomplete(_params: AutocompleteParams): Promise<PlaceSuggestion[]> {
    return Promise.reject(
      new NotImplementedException('Google Places provider is not implemented yet. Set PLATFORM_PLACES_PROVIDER=here.'),
    );
  }
}
