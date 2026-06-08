import { Module } from '@nestjs/common';
import { AdapterFactoryService } from './adapter-factory.service';

/**
 * AdaptersModule provides all external system adapters.
 *
 * This module exists to avoid circular dependencies between IntegrationsModule
 * and any sync module — both can import this module to access adapters without
 * creating a cycle.
 *
 * The starter ships with no concrete vendor adapters. Register your `@Injectable`
 * adapter providers here and wire them into `AdapterFactoryService`.
 */
@Module({
  providers: [AdapterFactoryService],
  exports: [AdapterFactoryService],
})
export class AdaptersModule {}
