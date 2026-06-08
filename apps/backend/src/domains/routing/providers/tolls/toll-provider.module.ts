import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HereTollProvider } from './here-toll.provider';
import { TOLL_PROVIDER } from './toll-provider.interface';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: TOLL_PROVIDER,
      useClass: HereTollProvider,
    },
  ],
  exports: [TOLL_PROVIDER],
})
export class TollProviderModule {}
