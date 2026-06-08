import { ConfigService } from '@nestjs/config';
import { createRoutingProvider } from '../routing-provider.module';
import { HereRoutingProvider } from '../here-routing.provider';
import { OSRMRoutingProvider } from '../osrm-routing.provider';

function config(values: Record<string, unknown>): ConfigService<any, true> {
  return { get: (key: string) => values[key] } as unknown as ConfigService<any, true>;
}

describe('createRoutingProvider', () => {
  it('uses HERE by default when a HERE key is present', () => {
    const provider = createRoutingProvider(config({ hereApiKey: 'k', osrmUrl: 'http://localhost:5000' }));
    expect(provider).toBeInstanceOf(HereRoutingProvider);
  });

  it('uses OSRM when explicitly selected and a URL is set', () => {
    const provider = createRoutingProvider(
      config({ routingProvider: 'osrm', osrmUrl: 'http://osrm:5000', hereApiKey: 'k' }),
    );
    expect(provider).toBeInstanceOf(OSRMRoutingProvider);
  });

  it('fails fast when OSRM is selected without a URL', () => {
    expect(() => createRoutingProvider(config({ routingProvider: 'osrm', osrmUrl: undefined }))).toThrow(/OSRM_URL/);
  });

  it('fails fast when nothing is configured (no silent haversine)', () => {
    expect(() => createRoutingProvider(config({}))).toThrow(/No routing provider configured/);
  });

  it('fails fast when HERE is implied but no key is present', () => {
    // routingProvider unset + no hereApiKey → refuse rather than degrade.
    expect(() => createRoutingProvider(config({ osrmUrl: undefined }))).toThrow(/No routing provider configured/);
  });
});
