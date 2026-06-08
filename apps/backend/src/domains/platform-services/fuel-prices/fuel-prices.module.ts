import { Module } from '@nestjs/common';
import { PlatformServicesCoreModule } from '../shared/platform-services-core.module';
import { FuelPriceService } from './fuel-price.service';
import { GasBuddyProvider } from './providers/gasbuddy.provider';

@Module({
  imports: [PlatformServicesCoreModule],
  providers: [FuelPriceService, GasBuddyProvider],
  exports: [FuelPriceService],
})
export class FuelPricesModule {}
