import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { GeocodingModule } from '../../platform-services/geocoding/geocoding.module';
import { StopsController } from './stops.controller';
import { StopsService } from './stops.service';
import { StopMatchService } from './stop-match.service';

@Module({
  imports: [PrismaModule, GeocodingModule],
  controllers: [StopsController],
  providers: [StopsService, StopMatchService],
  exports: [StopsService, StopMatchService],
})
export class StopsModule {}
