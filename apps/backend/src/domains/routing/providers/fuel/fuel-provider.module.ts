import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { PrismaModule } from '../../../../infrastructure/database/prisma.module';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { FUEL_DATA_PROVIDER } from './fuel-data-provider.interface';
import { DatabaseFuelProvider } from './database-fuel.provider';
import { HEREDiscoverFuelProvider } from './here-discover-fuel.provider';
import { FuelPricingService } from './fuel-pricing.service';

@Module({
  imports: [PrismaModule, ConfigModule],
  providers: [
    {
      provide: FUEL_DATA_PROVIDER,
      useFactory: (configService: ConfigService, prisma: PrismaService) => {
        const provider = configService.get<string>('FUEL_PROVIDER', 'here');
        if (provider === 'database') {
          return new DatabaseFuelProvider(prisma);
        }
        return new HEREDiscoverFuelProvider(configService);
      },
      inject: [ConfigService, PrismaService],
    },
    FuelPricingService,
  ],
  exports: [FUEL_DATA_PROVIDER, FuelPricingService],
})
export class FuelProviderModule {}
