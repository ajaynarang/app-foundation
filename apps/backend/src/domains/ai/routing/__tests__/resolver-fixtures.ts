import { ConfigService } from '@nestjs/config';
import { AiCredentialStatus, AiCredentialType } from '@appshore/db';
import { AiRouteResolver, type CreditRefusalSink } from '../ai-route-resolver.service';
import { CredentialCryptoService } from '../credential-crypto.service';
import type { PlatformRouteConfig } from '../route-registry';

export const TENANT = 7;
/** A valid `AI_CREDENTIALS_KEY` (64 hex characters). */
export const TEST_CREDENTIALS_KEY = 'a'.repeat(64);

export interface ResolverFixtureOptions {
  aiZeroRetention?: boolean;
  /** Platform keys, as the zod config schema names them. */
  config?: PlatformRouteConfig & { aiCredentialsKey?: string };
  /** The workspace's credential rows, as Postgres returns them (already ordered by priority). */
  credentials?: Record<string, unknown>[];
  refusalSink?: CreditRefusalSink;
}

export interface ResolverFixture {
  resolver: AiRouteResolver;
  prisma: { tenant: { findUnique: jest.Mock }; aiCredential: { findMany: jest.Mock } };
  cache: { getOrSet: jest.Mock };
  events: { emit: jest.Mock };
}

/** A resolver over mocks: the tenant's retention flag and credentials, a pass-through cache, a recording event bus, real config. */
export function makeResolver(opts: ResolverFixtureOptions = {}): ResolverFixture {
  const prisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue({ aiZeroRetention: opts.aiZeroRetention ?? false }) },
    aiCredential: { findMany: jest.fn().mockResolvedValue(opts.credentials ?? []) },
  };
  const cache = { getOrSet: jest.fn((_key: string, fn: () => unknown) => fn()) };
  const events = { emit: jest.fn().mockResolvedValue(undefined) };
  const config = new ConfigService({ ...(opts.config ?? {}) });
  const resolver = new AiRouteResolver(
    prisma as never,
    cache as never,
    events as never,
    config,
    new CredentialCryptoService(config),
    opts.refusalSink,
  );
  return { resolver, prisma, cache, events };
}

/**
 * A credential row whose secret is genuinely GCM-encrypted for (TENANT, publicId) under `TEST_CREDENTIALS_KEY`, so the
 * resolver's decrypt runs the real crypto. The public id is part of the binding: overriding it re-encrypts.
 */
export function credentialRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const crypto = new CredentialCryptoService(new ConfigService({ aiCredentialsKey: TEST_CREDENTIALS_KEY }));
  const publicId = (overrides.publicId as string) ?? 'aicred_test000001';
  const secret = (overrides.secret as string) ?? 'sk-ant-test-secret';
  const { ciphertext, keyVersion } = crypto.encrypt(secret, { tenantId: TENANT, credentialPublicId: publicId });
  const { secret: _secret, ...rest } = overrides;
  return {
    id: 1,
    tenantId: TENANT,
    type: AiCredentialType.ANTHROPIC_KEY,
    status: AiCredentialStatus.ACTIVE,
    priority: 0,
    encryptedSecret: ciphertext,
    keyVersion,
    lastFour: secret.slice(-4),
    updatedAt: new Date('2026-11-12T00:00:00Z'),
    zdrAttested: false,
    roleArn: null,
    externalId: null,
    awsRegion: null,
    ...rest,
    publicId,
  };
}
