import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HOSRuleEngineService } from './services/hos-rule-engine.service';

@Module({
  imports: [ConfigModule],
  providers: [HOSRuleEngineService],
  exports: [HOSRuleEngineService],
})
export class HOSComplianceModule {}
