import { Module } from '@nestjs/common';
import { PlatformServicesCoreModule } from '../shared/platform-services-core.module';
import { PlacesController } from './places.controller';
import { PlacesService } from './places.service';
import { GooglePlacesProvider } from './providers/google-places.provider';
import { HereAutosuggestProvider } from './providers/here-autosuggest.provider';
import { SmartyPlacesProvider } from './providers/smarty-places.provider';

@Module({
  imports: [PlatformServicesCoreModule],
  controllers: [PlacesController],
  providers: [PlacesService, HereAutosuggestProvider, GooglePlacesProvider, SmartyPlacesProvider],
  exports: [PlacesService],
})
export class PlacesModule {}
