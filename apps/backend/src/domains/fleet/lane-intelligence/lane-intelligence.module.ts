import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { LaneIntelligenceController } from './lane-intelligence.controller';
import { LaneIntelligenceService } from './lane-intelligence.service';

@Module({
  imports: [PrismaModule],
  controllers: [LaneIntelligenceController],
  providers: [LaneIntelligenceService],
  exports: [LaneIntelligenceService],
})
export class LaneIntelligenceModule {}
