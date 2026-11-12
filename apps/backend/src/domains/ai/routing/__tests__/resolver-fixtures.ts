import { ConfigService } from '@nestjs/config';
import { AiRouteResolver } from '../ai-route-resolver.service';
import type { PlatformRouteConfig } from '../route-registry';

export const TENANT = 7;

export interface ResolverFixtureOptions {
  aiZeroRetention?: boolean;
  /** Platform keys, as the zod config schema names them. */
  config?: PlatformRouteConfig;
}

export interface ResolverFixture {
  resolver: AiRouteResolver;
  prisma: { tenant: { findUnique: jest.Mock } };
  cache: { getOrSet: jest.Mock };
  events: { emit: jest.Mock };
}

/** A resolver over mocks: the tenant's retention flag, a pass-through cache, a recording event bus, real config. */
export function makeResolver(opts: ResolverFixtureOptions = {}): ResolverFixture {
  const prisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue({ aiZeroRetention: opts.aiZeroRetention ?? false }) },
  };
  const cache = { getOrSet: jest.fn((_key: string, fn: () => unknown) => fn()) };
  const events = { emit: jest.fn().mockResolvedValue(undefined) };
  const config = new ConfigService({ ...(opts.config ?? {}) });
  const resolver = new AiRouteResolver(prisma as never, cache as never, events as never, config);
  return { resolver, prisma, cache, events };
}
