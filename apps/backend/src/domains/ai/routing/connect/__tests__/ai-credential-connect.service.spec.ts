import { TenantSubKeyReader } from '../../provisioning/tenant-sub-key.reader';
import {
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiCredentialStatus, AiCredentialType } from '@appshore/db';
import type { EventActor } from '@appshore/kernel/infrastructure/events/domain-event';
import { createMockOutbox } from '@appshore/platform/test/mocks/outbox.mock';
import { AiCredentialConnectService } from '../ai-credential-connect.service';
import { CredentialCryptoService } from '../../credential-crypto.service';
import { AiRouteResolver, MAX_AI_CREDENTIALS_PER_WORKSPACE } from '../../ai-route-resolver.service';
import { AiCredentialFailing } from '../../ai-credential-failing.error';
import { ZeroRetentionUnavailable } from '../../../infrastructure/redaction/zero-retention-unavailable.error';
import { TEST_CREDENTIALS_KEY } from '../../__tests__/resolver-fixtures';

const TENANT = 7;
const ACTOR: EventActor = { id: '55', type: 'user' };
const FAKE_KEY = 'sk-or-v1-fake-key-abcdef';
const PLATFORM_ROLE = 'arn:aws:iam::999999999999:role/acme-ecs-task';
const TENANT_ROLE = 'arn:aws:iam::123456789012:role/acme-bedrock-access';
/** `PROJECT_NAME` "Acme Backend", slugged, then the workspace's public id. */
const EXTERNAL_ID = 'acme-backend-tnt_test01';

interface HarnessOptions {
  zdr?: boolean;
  rows?: any[];
  /** Config the service, the cipher and the resolver read; bring-your-own-key is on unless this drops the key. */
  config?: Record<string, unknown>;
}

function makeHarness(opts: HarnessOptions = {}) {
  const tenant = { aiZeroRetention: opts.zdr ?? false, tenantId: 'tnt_test01' };
  const rows: any[] = opts.rows ?? [];
  let nextId = 100;

  const aiCredential = {
    findMany: jest.fn(async ({ where }: any) =>
      rows.filter((r) => r.tenantId === where.tenantId).sort((a, b) => a.priority - b.priority),
    ),
    findFirst: jest.fn(
      async ({ where }: any) =>
        rows.find((r) => r.tenantId === where.tenantId && r.publicId === where.publicId) ?? null,
    ),
    count: jest.fn(async ({ where }: any) => rows.filter((r) => r.tenantId === where.tenantId).length),
    aggregate: jest.fn(async ({ where }: any) => {
      const mine = rows.filter((r) => r.tenantId === where.tenantId);
      return { _max: { priority: mine.length ? Math.max(...mine.map((r) => r.priority)) : null } };
    }),
    create: jest.fn(async ({ data }: any) => {
      const saved = {
        id: nextId++,
        createdAt: new Date(),
        updatedAt: new Date(),
        roleArn: null,
        externalId: null,
        awsRegion: null,
        lastError: null,
        ...data,
      };
      rows.push(saved);
      return saved;
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const row = rows.find((r) => r.id === where.id);
      Object.assign(row, data, { updatedAt: new Date() });
      return row;
    }),
    delete: jest.fn(async ({ where }: any) => {
      rows.splice(
        rows.findIndex((r) => r.id === where.id),
        1,
      );
    }),
  };

  const prisma: any = {
    aiCredential,
    tenant: {
      findUnique: jest.fn(async () => ({ aiZeroRetention: tenant.aiZeroRetention, tenantId: tenant.tenantId })),
      update: jest.fn(async ({ data }: any) => {
        tenant.aiZeroRetention = data.aiZeroRetention;
        return { tenantId: tenant.tenantId };
      }),
    },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };

  // A map-backed cache with the resolver's getOrSet and the service's del, so the policy-flip proof is real.
  const cacheStore = new Map<string, unknown>();
  const cache: any = {
    getOrSet: jest.fn(async (key: string, fn: () => unknown) => {
      if (cacheStore.has(key)) return cacheStore.get(key);
      const value = await fn();
      cacheStore.set(key, value);
      return value;
    }),
    del: jest.fn(async (key: string) => {
      cacheStore.delete(key);
    }),
  };

  const outbox = createMockOutbox(prisma);
  const notifications = { aiCredentialFailing: jest.fn().mockResolvedValue(undefined) };
  const probe = {
    probeKey: jest.fn().mockResolvedValue({ ok: true, latencyMs: 100, detail: 'OK' }),
    probeBedrock: jest.fn().mockResolvedValue({ ok: true, latencyMs: 200, detail: 'OK' }),
  };
  const config = new ConfigService({
    aiCredentialsKey: TEST_CREDENTIALS_KEY,
    projectName: 'Acme Backend',
    platformAssumeRoleArn: [PLATFORM_ROLE],
    ...(opts.config ?? {}),
  });
  const crypto = new CredentialCryptoService(config);
  const events = { emit: jest.fn().mockResolvedValue(undefined) };
  const resolver = new AiRouteResolver(
    prisma,
    cache,
    events as never,
    config,
    crypto,
    new TenantSubKeyReader(prisma, crypto),
  );
  jest.spyOn(resolver, 'evictCredential');

  const service = new AiCredentialConnectService(
    prisma,
    cache,
    outbox as never,
    notifications as never,
    crypto,
    probe,
    resolver,
    config,
  );
  return { service, prisma, cache, cacheStore, outbox, notifications, probe, rows, tenant, resolver, crypto };
}

type Harness = ReturnType<typeof makeHarness>;

function keyRow(h: Harness, overrides: Record<string, unknown> = {}): any {
  const publicId = (overrides.publicId as string) ?? 'aicred_valid00001';
  const tenantId = (overrides.tenantId as number) ?? TENANT;
  const enc = h.crypto.encrypt(FAKE_KEY, { tenantId, credentialPublicId: publicId });
  const row = {
    id: 1,
    publicId,
    tenantId,
    type: AiCredentialType.OPENROUTER_KEY,
    status: AiCredentialStatus.ACTIVE,
    priority: 0,
    encryptedSecret: enc.ciphertext,
    keyVersion: enc.keyVersion,
    lastFour: 'cdef',
    roleArn: null,
    externalId: null,
    awsRegion: null,
    zdrAttested: false,
    zdrAttestedBy: null,
    zdrAttestedAt: null,
    lastValidatedAt: null,
    lastError: null,
    createdBy: 55,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  h.rows.push(row);
  return row;
}

const emitted = (h: Harness) => h.outbox.emit.mock.calls.map((c: any[]) => c[0]);

describe('AiCredentialConnectService', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  describe('connectKey', () => {
    it('tests the key first and stores nothing when the test fails, answering with the redacted reason', async () => {
      const h = makeHarness();
      h.probe.probeKey.mockResolvedValue({ ok: false, latencyMs: 50, detail: '401 [redacted]' });
      const attempt = h.service.connectKey(TENANT, { type: 'OPENROUTER_KEY', secret: FAKE_KEY }, ACTOR, 55);
      await expect(attempt).rejects.toThrow(BadRequestException);
      await expect(attempt).rejects.toMatchObject({
        response: { fieldErrors: { secret: expect.stringContaining('401 [redacted]') } },
      });
      expect(h.rows).toHaveLength(0);
      expect(h.outbox.emit).not.toHaveBeenCalled();
    });

    it('stores a GCM envelope bound to the row and the last four, and emits connected and validated', async () => {
      const h = makeHarness();
      const result = await h.service.connectKey(TENANT, { type: 'OPENROUTER_KEY', secret: FAKE_KEY }, ACTOR, 55);

      expect(h.rows).toHaveLength(1);
      const saved = h.rows[0];
      expect(saved.encryptedSecret).not.toContain(FAKE_KEY);
      expect(saved.lastFour).toBe(FAKE_KEY.slice(-4));
      expect(saved.publicId).toMatch(/^aicred_[0-9a-z]{10}$/);
      expect(saved).toMatchObject({ status: 'ACTIVE', createdBy: 55, zdrAttested: false });
      expect(
        h.crypto.decrypt(saved.encryptedSecret, saved.keyVersion, {
          tenantId: TENANT,
          credentialPublicId: saved.publicId,
        }),
      ).toBe(FAKE_KEY);

      expect(emitted(h)).toEqual(['app.ai.credential-connected', 'app.ai.credential-validated']);
      expect(h.outbox.emit).toHaveBeenCalledWith(
        'app.ai.credential-connected',
        TENANT,
        { credentialPublicId: saved.publicId, type: 'OPENROUTER_KEY' },
        ACTOR,
      );
      expect(result.credential.publicId).toBe(saved.publicId);
      expect(result.probe.ok).toBe(true);
    });

    it('no secret material in the events or the response', async () => {
      const h = makeHarness();
      const result = await h.service.connectKey(TENANT, { type: 'OPENROUTER_KEY', secret: FAKE_KEY }, ACTOR, 55);
      expect(JSON.stringify(h.outbox.emit.mock.calls)).not.toContain(FAKE_KEY);
      expect(JSON.stringify(result)).not.toContain(FAKE_KEY);
      expect(JSON.stringify(result)).not.toContain(h.rows[0].encryptedSecret);
    });

    it.each(['OPENROUTER_KEY', 'VERCEL_GATEWAY_KEY'] as const)(
      'refuses %s under a zero-retention policy, before any test call',
      async (type) => {
        const h = makeHarness({ zdr: true });
        await expect(h.service.connectKey(TENANT, { type, secret: FAKE_KEY }, ACTOR, 55)).rejects.toThrow(
          /zero data retention/,
        );
        expect(h.probe.probeKey).not.toHaveBeenCalled();
      },
    );

    it('allows an Anthropic key under zero retention and records who attested and when', async () => {
      const h = makeHarness({ zdr: true });
      await h.service.connectKey(
        TENANT,
        { type: 'ANTHROPIC_KEY', secret: 'sk-ant-fake-key-123456', zdrAttested: true },
        ACTOR,
        55,
      );
      expect(h.rows[0]).toMatchObject({ zdrAttested: true, zdrAttestedBy: 55, zdrAttestedAt: expect.any(Date) });
    });

    it('records no attestation when it was not given', async () => {
      const h = makeHarness();
      await h.service.connectKey(TENANT, { type: 'ANTHROPIC_KEY', secret: 'sk-ant-fake-key-123456' }, ACTOR, 55);
      expect(h.rows[0]).toMatchObject({ zdrAttested: false, zdrAttestedBy: null, zdrAttestedAt: null });
    });

    it('refuses zdrAttested on a type other than an Anthropic key, naming the field', async () => {
      const h = makeHarness();
      await expect(
        h.service.connectKey(TENANT, { type: 'OPENROUTER_KEY', secret: FAKE_KEY, zdrAttested: true }, ACTOR, 55),
      ).rejects.toMatchObject({
        response: { fieldErrors: { zdrAttested: expect.stringMatching(/Anthropic keys only/) } },
      });
    });

    it('refuses the AWS role type here (it has its own flow), naming the field', async () => {
      const h = makeHarness();
      await expect(
        h.service.connectKey(TENANT, { type: 'BEDROCK_ROLE' as never, secret: 'irrelevant-secret' }, ACTOR, 55),
      ).rejects.toMatchObject({ response: { fieldErrors: { type: expect.any(String) } } });
      expect(h.probe.probeKey).not.toHaveBeenCalled();
    });

    it('assigns priority as the workspace maximum plus one', async () => {
      const h = makeHarness();
      await h.service.connectKey(TENANT, { type: 'OPENROUTER_KEY', secret: FAKE_KEY }, ACTOR, 55);
      await h.service.connectKey(TENANT, { type: 'ANTHROPIC_KEY', secret: 'sk-ant-fake-key-999999' }, ACTOR, 55);
      expect(h.rows.map((r) => r.priority)).toEqual([0, 1]);
    });

    it('refuses a key over the per-workspace cap (409) before any test call', async () => {
      const h = makeHarness();
      for (let i = 0; i < MAX_AI_CREDENTIALS_PER_WORKSPACE; i++)
        keyRow(h, { id: i + 1, publicId: `aicred_cap${String(i).padStart(7, '0')}` });
      await expect(
        h.service.connectKey(TENANT, { type: 'OPENROUTER_KEY', secret: FAKE_KEY }, ACTOR, 55),
      ).rejects.toThrow(ConflictException);
      expect(h.probe.probeKey).not.toHaveBeenCalled();
    });

    it('publishes nothing when the transaction rolls back', async () => {
      const h = makeHarness();
      h.prisma.aiCredential.create.mockRejectedValue(new Error('db down'));
      await expect(
        h.service.connectKey(TENANT, { type: 'OPENROUTER_KEY', secret: FAKE_KEY }, ACTOR, 55),
      ).rejects.toThrow('db down');
      expect(h.outbox.emit).not.toHaveBeenCalled();
    });

    it('is off (404) when AI_CREDENTIALS_KEY is unset, before any test call', async () => {
      const h = makeHarness({ config: { aiCredentialsKey: undefined } });
      await expect(
        h.service.connectKey(TENANT, { type: 'OPENROUTER_KEY', secret: FAKE_KEY }, ACTOR, 55),
      ).rejects.toThrow(NotFoundException);
      expect(h.probe.probeKey).not.toHaveBeenCalled();
    });
  });

  describe('the AWS Bedrock role flow', () => {
    describe('begin', () => {
      it('answers 503 when the deployment has no role to be trusted (PLATFORM_ASSUME_ROLE_ARN unset)', async () => {
        const h = makeHarness({ config: { platformAssumeRoleArn: [] } });
        await expect(h.service.beginBedrock(TENANT)).rejects.toThrow(ServiceUnavailableException);
      });

      it('pins the trust policy to the deployment role and the workspace external id', async () => {
        const h = makeHarness();
        const out = await h.service.beginBedrock(TENANT);
        expect(out.externalId).toBe(EXTERNAL_ID);
        expect(out.platformRoleArns).toEqual([PLATFORM_ROLE]);
        expect(out.roleName).toBe('acme-backend-bedrock-access');
        const policy = JSON.parse(out.trustPolicy);
        expect(policy.Statement).toHaveLength(1);
        expect(policy.Statement[0]).toMatchObject({
          Effect: 'Allow',
          Action: 'sts:AssumeRole',
          Principal: { AWS: PLATFORM_ROLE },
          Condition: { StringEquals: { 'sts:ExternalId': EXTERNAL_ID } },
        });
        expect(out.terraformSnippet).toContain('sts:ExternalId');
        expect(out.terraformSnippet).toContain(EXTERNAL_ID);
        expect(out.cfnQuickCreateUrl).toBeNull();
      });

      it('names every ARN of PLATFORM_ASSUME_ROLE_ARN in the trust policy and the Terraform snippet', async () => {
        const worker = 'arn:aws:iam::999999999999:role/acme-ecs-worker';
        const h = makeHarness({ config: { platformAssumeRoleArn: [PLATFORM_ROLE, worker] } });
        const out = await h.service.beginBedrock(TENANT);
        expect(out.platformRoleArns).toEqual([PLATFORM_ROLE, worker]);
        expect(JSON.parse(out.trustPolicy).Statement[0].Principal.AWS).toEqual([PLATFORM_ROLE, worker]);
        expect(out.terraformSnippet).toContain(PLATFORM_ROLE);
        expect(out.terraformSnippet).toContain(worker);
      });

      it('limits the permissions policy to invoking the catalog models, and passes the CloudFormation link', async () => {
        const h = makeHarness({ config: { platformBedrockCfnTemplateUrl: 'https://example.com/role.yaml' } });
        const out = await h.service.beginBedrock(TENANT);
        const statement = JSON.parse(out.permissionsPolicy).Statement[0];
        expect(statement.Action).toEqual(['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream']);
        expect(statement.Resource).toContain('arn:aws:bedrock:*:*:inference-profile/us.anthropic.claude-sonnet-5-5');
        expect(statement.Resource).toContain('arn:aws:bedrock:*::foundation-model/anthropic.claude-sonnet-5-5');
        expect(statement.Resource).toContain('arn:aws:bedrock:*::foundation-model/cohere.embed-v4:0');
        expect(statement.Resource).not.toContain('*');
        expect(out.cfnQuickCreateUrl).toBe('https://example.com/role.yaml');
      });

      it('is off (404) when AI_CREDENTIALS_KEY is unset', async () => {
        const h = makeHarness({ config: { aiCredentialsKey: undefined } });
        await expect(h.service.beginBedrock(TENANT)).rejects.toThrow(NotFoundException);
      });
    });

    describe('complete', () => {
      const input = { roleArn: TENANT_ROLE, awsRegion: 'us-west-2' };

      it('recomputes the external id on the server and stores nothing when the check fails', async () => {
        const h = makeHarness();
        h.probe.probeBedrock.mockResolvedValue({ ok: false, latencyMs: 10, detail: 'not pinned' });
        await expect(
          h.service.completeBedrock(TENANT, { ...input, externalId: 'attacker-chosen' } as never, ACTOR, 55),
        ).rejects.toMatchObject({ response: { fieldErrors: { roleArn: expect.stringMatching(/not pinned/) } } });
        expect(h.probe.probeBedrock).toHaveBeenCalledWith(
          expect.objectContaining({
            roleArn: TENANT_ROLE,
            externalId: EXTERNAL_ID,
            awsRegion: 'us-west-2',
            projectSlug: 'acme-backend',
          }),
        );
        expect(h.rows).toHaveLength(0);
        expect(h.outbox.emit).not.toHaveBeenCalled();
      });

      it('stores a secretless ACTIVE row with the role, region and server external id, and emits connected', async () => {
        const h = makeHarness();
        const result = await h.service.completeBedrock(TENANT, input, ACTOR, 55);
        const saved = h.rows[0];
        expect(saved).toMatchObject({
          type: AiCredentialType.BEDROCK_ROLE,
          status: AiCredentialStatus.ACTIVE,
          encryptedSecret: null,
          lastFour: null,
          roleArn: TENANT_ROLE,
          externalId: EXTERNAL_ID,
          awsRegion: 'us-west-2',
          createdBy: 55,
        });
        // The probe's session was named for the credential that was then stored.
        expect(h.probe.probeBedrock.mock.calls[0][0].credentialPublicId).toBe(saved.publicId);
        expect(result.credential).toMatchObject({ type: 'BEDROCK_ROLE', roleArn: TENANT_ROLE, awsRegion: 'us-west-2' });
        expect(JSON.stringify(result)).not.toContain(EXTERNAL_ID);
        expect(emitted(h)).toEqual(['app.ai.credential-connected', 'app.ai.credential-validated']);
      });

      it('is allowed under a zero-retention policy (a role is zero retention)', async () => {
        const h = makeHarness({ zdr: true });
        await expect(h.service.completeBedrock(TENANT, input, ACTOR, 55)).resolves.toBeDefined();
      });

      it('refuses a region the catalog profiles cannot be called from, before any AWS call', async () => {
        const h = makeHarness();
        await expect(
          h.service.completeBedrock(TENANT, { ...input, awsRegion: 'eu-west-1' }, ACTOR, 55),
        ).rejects.toMatchObject({ response: { fieldErrors: { awsRegion: expect.any(String) } } });
        expect(h.probe.probeBedrock).not.toHaveBeenCalled();
      });

      it('refuses over the per-workspace cap (409) before any AWS call', async () => {
        const h = makeHarness();
        for (let i = 0; i < MAX_AI_CREDENTIALS_PER_WORKSPACE; i++) keyRow(h, { id: i + 1, publicId: `aicred_cap${i}` });
        await expect(h.service.completeBedrock(TENANT, input, ACTOR, 55)).rejects.toThrow(ConflictException);
        expect(h.probe.probeBedrock).not.toHaveBeenCalled();
      });

      it('answers 503 when PLATFORM_ASSUME_ROLE_ARN is unset, and 404 when AI_CREDENTIALS_KEY is unset', async () => {
        await expect(
          makeHarness({ config: { platformAssumeRoleArn: [] } }).service.completeBedrock(TENANT, input, ACTOR, 55),
        ).rejects.toThrow(ServiceUnavailableException);
        await expect(
          makeHarness({ config: { aiCredentialsKey: undefined } }).service.completeBedrock(TENANT, input, ACTOR, 55),
        ).rejects.toThrow(NotFoundException);
      });
    });

    it('Test again re-runs the two-direction check on a stored role, never a decrypt or a key probe', async () => {
      const h = makeHarness();
      keyRow(h, {
        publicId: 'aicred_role00001',
        type: AiCredentialType.BEDROCK_ROLE,
        encryptedSecret: null,
        lastFour: null,
        roleArn: TENANT_ROLE,
        externalId: EXTERNAL_ID,
        awsRegion: 'us-west-2',
      });
      h.probe.probeBedrock.mockResolvedValue({ ok: false, latencyMs: 5, detail: 'role was deleted' });
      const result = await h.service.validate(TENANT, 'aicred_role00001', ACTOR);
      expect(h.probe.probeBedrock).toHaveBeenCalledWith({
        roleArn: TENANT_ROLE,
        externalId: EXTERNAL_ID,
        awsRegion: 'us-west-2',
        credentialPublicId: 'aicred_role00001',
        projectSlug: 'acme-backend',
      });
      expect(h.probe.probeKey).not.toHaveBeenCalled();
      expect(result.credential.status).toBe(AiCredentialStatus.FAILING);
    });
  });

  describe('getSettings', () => {
    it('reports the policy, whether bring-your-own-key is on, who pays per need, and the cards', async () => {
      const h = makeHarness({ config: { openRouterApiKey: 'sk-or-platform' } });
      keyRow(h, { type: AiCredentialType.ANTHROPIC_KEY });
      const settings = await h.service.getSettings(TENANT);
      expect(settings).toMatchObject({
        policy: 'STANDARD',
        byokEnabled: true,
        payers: { language: 'aicred_valid00001', embedding: 'none' },
      });
      expect(settings.credentials).toHaveLength(1);
    });

    it('with the key unset: byokEnabled false, and existing cards still listed so an owner can remove them', async () => {
      const h = makeHarness({ config: { aiCredentialsKey: undefined, openRouterApiKey: 'sk-or-platform' } });
      const crypto = new CredentialCryptoService(new ConfigService({ aiCredentialsKey: TEST_CREDENTIALS_KEY }));
      const enc = crypto.encrypt(FAKE_KEY, { tenantId: TENANT, credentialPublicId: 'aicred_stranded01' });
      h.rows.push({ ...keyRowShape(), publicId: 'aicred_stranded01', encryptedSecret: enc.ciphertext });
      const settings = await h.service.getSettings(TENANT);
      expect(settings.byokEnabled).toBe(false);
      expect(settings.credentials.map((c) => c.publicId)).toEqual(['aicred_stranded01']);
      // An ACTIVE key the app can no longer read still owns the need: the workspace is blocked, not moved.
      expect(settings.payers.language).toBe('none');
    });
  });

  describe('validate (Test again) and the failure lifecycle', () => {
    it('a failed test: ACTIVE to FAILING, the redacted reason stored, an event, and owners told once', async () => {
      const h = makeHarness();
      const row = keyRow(h);
      h.probe.probeKey.mockResolvedValue({ ok: false, latencyMs: 30, detail: '401 [redacted]' });

      const result = await h.service.validate(TENANT, row.publicId, ACTOR);
      expect(row.status).toBe(AiCredentialStatus.FAILING);
      expect(row.lastError).toBe('401 [redacted]');
      expect(h.outbox.emit).toHaveBeenCalledWith('app.ai.credential-failed', TENANT, expect.anything(), ACTOR);
      expect(h.notifications.aiCredentialFailing).toHaveBeenCalledWith(
        TENANT,
        expect.objectContaining({ type: 'OPENROUTER_KEY', lastFour: 'cdef' }),
        'failed-test',
      );
      expect(result.credential.status).toBe(AiCredentialStatus.FAILING);
    });

    it('a key that keeps failing does not notify again on every test', async () => {
      const h = makeHarness();
      const row = keyRow(h, { status: AiCredentialStatus.FAILING, lastError: 'old' });
      h.probe.probeKey.mockResolvedValue({ ok: false, latencyMs: 30, detail: '401 [redacted]' });
      await h.service.validate(TENANT, row.publicId, ACTOR);
      expect(row.lastError).toBe('401 [redacted]');
      expect(h.notifications.aiCredentialFailing).not.toHaveBeenCalled();
    });

    it('a passing test on a FAILING row: back to ACTIVE, lastError cleared, a validated event, nobody told', async () => {
      const h = makeHarness();
      const row = keyRow(h, { status: AiCredentialStatus.FAILING, lastError: 'old error' });
      const result = await h.service.validate(TENANT, row.publicId, ACTOR);
      expect(row.status).toBe(AiCredentialStatus.ACTIVE);
      expect(row.lastError).toBeNull();
      expect(row.lastValidatedAt).toBeInstanceOf(Date);
      expect(h.outbox.emit).toHaveBeenCalledWith('app.ai.credential-validated', TENANT, expect.anything(), ACTOR);
      expect(h.notifications.aiCredentialFailing).not.toHaveBeenCalled();
      expect(result.probe.ok).toBe(true);
    });

    it('tests the decrypted secret, never anything else', async () => {
      const h = makeHarness();
      const row = keyRow(h);
      await h.service.validate(TENANT, row.publicId, ACTOR);
      expect(h.probe.probeKey).toHaveBeenCalledWith('OPENROUTER_KEY', FAKE_KEY);
    });

    it('a secret that no longer decrypts (the key was changed) fails the test without calling the provider', async () => {
      const h = makeHarness();
      const row = keyRow(h);
      const other = makeHarness({ config: { aiCredentialsKey: 'b'.repeat(64) }, rows: h.rows });
      await other.service.validate(TENANT, row.publicId, ACTOR);
      expect(other.probe.probeKey).not.toHaveBeenCalled();
      expect(row.status).toBe(AiCredentialStatus.FAILING);
      expect(row.lastError).toMatch(/cannot be read/);
    });

    it('a DISABLED credential cannot be tested back to life (409)', async () => {
      const h = makeHarness();
      const row = keyRow(h, { status: AiCredentialStatus.DISABLED });
      await expect(h.service.validate(TENANT, row.publicId, ACTOR)).rejects.toThrow(ConflictException);
    });

    it("another workspace's credential answers 404, the same as a missing one", async () => {
      const h = makeHarness();
      const row = keyRow(h, { tenantId: 999 });
      await expect(h.service.validate(TENANT, row.publicId, ACTOR)).rejects.toThrow(NotFoundException);
      await expect(h.service.validate(TENANT, 'aicred_missing000', ACTOR)).rejects.toThrow(NotFoundException);
    });

    it('is off (404) when AI_CREDENTIALS_KEY is unset', async () => {
      const h = makeHarness({ config: { aiCredentialsKey: undefined } });
      h.rows.push({ ...keyRowShape() });
      await expect(h.service.validate(TENANT, 'aicred_valid00001', ACTOR)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deletes the row, emits removed and drops the cached provider holding the secret', async () => {
      const h = makeHarness();
      await h.service.connectKey(TENANT, { type: 'OPENROUTER_KEY', secret: FAKE_KEY }, ACTOR, 55);
      const { publicId, id } = h.rows[0];
      await h.service.remove(TENANT, publicId, ACTOR);
      expect(h.rows).toHaveLength(0);
      expect(h.outbox.emit).toHaveBeenCalledWith(
        'app.ai.credential-removed',
        TENANT,
        { credentialPublicId: publicId, type: 'OPENROUTER_KEY' },
        ACTOR,
      );
      expect(h.resolver.evictCredential).toHaveBeenCalledWith(id);
    });

    it('works with AI_CREDENTIALS_KEY unset, so an owner can clear a key the app can no longer read', async () => {
      const h = makeHarness({ config: { aiCredentialsKey: undefined } });
      h.rows.push({ ...keyRowShape() });
      await h.service.remove(TENANT, 'aicred_valid00001', ACTOR);
      expect(h.rows).toHaveLength(0);
    });

    it("another workspace's credential answers 404 and stays", async () => {
      const h = makeHarness();
      keyRow(h, { tenantId: 999 });
      await expect(h.service.remove(TENANT, 'aicred_valid00001', ACTOR)).rejects.toThrow(NotFoundException);
      expect(h.rows).toHaveLength(1);
    });
  });

  describe('the retention policy flip', () => {
    it('changes routing on the very next resolve: the cached policy is deleted after the commit', async () => {
      const h = makeHarness({ config: { cohereApiKey: 'co-test' } });
      const before = await h.resolver.resolve(TENANT, 'embedding'); // warms the policy cache under STANDARD
      expect(before.routeId).toBe('platform-cohere');

      await h.service.updatePolicy(TENANT, 'ZDR', ACTOR);

      // No time passes: only the delete stands between the flip and a minute of stale standard routing.
      await expect(h.resolver.resolve(TENANT, 'embedding')).rejects.toThrow(ZeroRetentionUnavailable);
      expect(h.outbox.emit).toHaveBeenCalledWith('app.ai.retention-policy-changed', TENANT, { policy: 'ZDR' }, ACTOR);
    });

    it('a flip back to standard keeps an attested key serving: the platform is not used', async () => {
      const h = makeHarness({ zdr: true, config: { openRouterApiKey: 'sk-or-platform' } });
      keyRow(h, { type: AiCredentialType.ANTHROPIC_KEY, zdrAttested: true });
      expect((await h.resolver.resolve(TENANT, 'language')).payer).toBe('TENANT');
      await h.service.updatePolicy(TENANT, 'STANDARD', ACTOR);
      expect((await h.resolver.resolve(TENANT, 'language')).payer).toBe('TENANT');
    });

    it('is non-destructive: credentials stay and report inert, and their payer leaves them', async () => {
      const h = makeHarness({ config: { openRouterApiKey: 'sk-or-platform' } });
      await h.service.connectKey(TENANT, { type: 'OPENROUTER_KEY', secret: FAKE_KEY }, ACTOR, 55);
      const settings = await h.service.updatePolicy(TENANT, 'ZDR', ACTOR);
      expect(settings.credentials).toHaveLength(1);
      expect(settings.credentials[0].inertUnderPolicy).toBe(true);
      expect(settings.policy).toBe('ZDR');
    });

    it('works with AI_CREDENTIALS_KEY unset', async () => {
      const h = makeHarness({ config: { aiCredentialsKey: undefined } });
      await expect(h.service.updatePolicy(TENANT, 'ZDR', ACTOR)).resolves.toMatchObject({ policy: 'ZDR' });
    });

    it('a workspace whose only key is failing stays blocked after the flip: never the platform key', async () => {
      const h = makeHarness({ config: { openRouterApiKey: 'sk-or-platform' } });
      keyRow(h, { type: AiCredentialType.ANTHROPIC_KEY, zdrAttested: true, status: AiCredentialStatus.FAILING });
      await h.service.updatePolicy(TENANT, 'ZDR', ACTOR);
      await expect(h.resolver.resolve(TENANT, 'language')).rejects.toThrow(AiCredentialFailing);
    });
  });
});

function keyRowShape(): any {
  return {
    id: 1,
    publicId: 'aicred_valid00001',
    tenantId: TENANT,
    type: AiCredentialType.OPENROUTER_KEY,
    status: AiCredentialStatus.ACTIVE,
    priority: 0,
    encryptedSecret: '00:00:00',
    keyVersion: 1,
    lastFour: 'cdef',
    roleArn: null,
    externalId: null,
    awsRegion: null,
    zdrAttested: false,
    zdrAttestedBy: null,
    zdrAttestedAt: null,
    lastValidatedAt: null,
    lastError: null,
    createdBy: 55,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
