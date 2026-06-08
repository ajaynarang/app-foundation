import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { Configuration } from '../../../../config/configuration';
import { ROUTING_PROVIDER } from './routing-provider.interface';
import { OSRMRoutingProvider } from './osrm-routing.provider';
import { HereRoutingProvider } from './here-routing.provider';

/**
 * Resolve the routing provider, preferring real road-network routing.
 *
 * Precedence:
 *   1. ROUTING_PROVIDER=osrm explicitly → OSRM (requires OSRM_URL reachable).
 *   2. A HERE_API_KEY is present → HERE (the production default).
 *   3. ROUTING_PROVIDER=here but no key → fail fast (don't silently degrade).
 *   4. Nothing configured → fail fast.
 *
 * The old behavior defaulted to OSRM@localhost:5000, so a prod deploy with no
 * OSRM silently fell through to haversine "distances". That is a correctness
 * hazard for a planner — better to refuse to start than to plan on straight lines.
 */
export function createRoutingProvider(configService: ConfigService<Configuration, true>) {
  const logger = new Logger('RoutingProviderModule');
  const explicit = configService.get('routingProvider', { infer: true });
  const hereKey = configService.get('hereApiKey', { infer: true });
  const osrmUrl = configService.get('osrmUrl', { infer: true });

  if (explicit === 'osrm') {
    if (!osrmUrl) {
      throw new Error('ROUTING_PROVIDER=osrm but OSRM_URL is not configured. Set OSRM_URL or use HERE.');
    }
    logger.log('Routing provider: OSRM (explicit)');
    return new OSRMRoutingProvider(configService);
  }

  if (hereKey) {
    logger.log('Routing provider: HERE');
    return new HereRoutingProvider(configService);
  }

  throw new Error(
    'No routing provider configured. Set HERE_API_KEY (recommended) or ROUTING_PROVIDER=osrm with a reachable OSRM_URL. ' +
      'Refusing to start to avoid planning routes on haversine straight-line estimates.',
  );
}

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: ROUTING_PROVIDER,
      useFactory: createRoutingProvider,
      inject: [ConfigService],
    },
  ],
  exports: [ROUTING_PROVIDER],
})
export class RoutingProviderModule {}
