import { Module } from '@nestjs/common';
import { CapabilityRegistryController } from './capability-registry.controller';
import { CapabilityRegistryService } from './capability-registry.service';

@Module({
  controllers: [CapabilityRegistryController],
  providers: [CapabilityRegistryService],
  exports: [CapabilityRegistryService],
})
export class CapabilityRegistryModule {}
