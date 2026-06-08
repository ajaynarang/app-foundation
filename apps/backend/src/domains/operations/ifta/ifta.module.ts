import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { IftaController } from './ifta.controller';
import { IftaService } from './services/ifta.service';
import { IftaMileageService } from './services/ifta-mileage.service';
import { IftaFuelService } from './services/ifta-fuel.service';
import { IftaTaxRateService } from './services/ifta-tax-rate.service';
import { IftaAnomalyDetectorService } from './services/ifta-anomaly-detector.service';

@Module({
  imports: [PrismaModule],
  controllers: [IftaController],
  providers: [IftaService, IftaMileageService, IftaFuelService, IftaTaxRateService, IftaAnomalyDetectorService],
  exports: [IftaService, IftaFuelService],
})
export class IftaModule {}
