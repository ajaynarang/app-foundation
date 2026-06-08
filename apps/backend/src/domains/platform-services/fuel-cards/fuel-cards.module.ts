import { Module } from '@nestjs/common';
import { FuelCardsController } from './fuel-cards.controller';
import { FuelCardsService } from './fuel-cards.service';

@Module({
  controllers: [FuelCardsController],
  providers: [FuelCardsService],
  exports: [FuelCardsService],
})
export class FuelCardsModule {}
