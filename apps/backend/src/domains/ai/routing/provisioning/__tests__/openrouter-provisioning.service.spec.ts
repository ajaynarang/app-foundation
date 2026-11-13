import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenRouterProvisioningService } from '../openrouter-provisioning.service';
import { SUB_KEY_BINDING_ID, TenantSubKeyReader } from '../tenant-sub-key.reader';
import { CredentialCryptoService } from '../../credential-crypto.service';

const TENANT = 7;
const FAKE_SUB_KEY = 'sk-or-v1-subkey-fake-000111';
const MGMT_KEY = 'sk-or-mgmt-fake';
const CREDENTIALS_KEY = 'a'.repeat(64);

interface Row {
  tenantId: number;
  keyHash: string;
  encryptedKey: string;
  keyVersion: number;
  limitUsd: unknown;
  updatedAt: Date;
}

function ok(body: unknown = {}) {
  return { ok: true, status: 200, json: async () => body };
}

describe('OpenRouterProvisioningService', () => {
  let fetchSpy: jest.SpyInstance;
  let rows: Row[];
  let prisma: any;
  let config: Record<string, unknown>;

  beforeEach(() => {
    config = {
      openRouterProvisioningKey: MGMT_KEY,
      aiCredentialsKey: CREDENTIALS_KEY,
      projectName: 'Acme Books',
    };
    rows = [];
    prisma = {
      tenantAiSubKey: {
        findUnique: jest.fn(async ({ where }: any) => rows.find((r) => r.tenantId === where.tenantId) ?? null),
        create: jest.fn(async ({ data }: any) => {
          const saved = { id: 1, createdAt: new Date(), updatedAt: new Date(), provider: 'openrouter', ...data };
          rows.push(saved);
          return saved;
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const row = rows.find((r) => r.tenantId === where.tenantId);
          Object.assign(row, data, { updatedAt: new Date() });
          return row;
        }),
      },
      tenant: { findUnique: jest.fn().mockResolvedValue({ tenantId: 'ws_test01' }) },
      tenantAiBudget: { findUnique: jest.fn().mockResolvedValue({ monthlyHardUsd: '500' }) },
    };
    fetchSpy = jest.spyOn(global, 'fetch' as never);
  });
  afterEach(() => {
    fetchSpy.mockRestore();
    jest.restoreAllMocks();
  });

  function crypto() {
    return new CredentialCryptoService(new ConfigService(config));
  }

  function service(cryptoService: CredentialCryptoService = crypto()) {
    return new OpenRouterProvisioningService(prisma, cryptoService, new ConfigService(config));
  }

  function calls(method: string) {
    return fetchSpy.mock.calls.filter(([, init]: any[]) => init.method === method);
  }

  it('creates a workspace-named, budget-capped, monthly-reset key and stores a decryptable envelope', async () => {
    fetchSpy.mockResolvedValue(ok({ key: FAKE_SUB_KEY, data: { hash: 'orhash123' } }));

    await expect(service().ensureSubKey(TENANT)).resolves.toBe(true);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/keys');
    expect(init.method).toBe('POST');
    // The name is the product's slug and the workspace's public id: nothing names the template.
    expect(JSON.parse(init.body)).toEqual({ name: 'acme-books-ws_test01', limit: 500, limit_reset: 'monthly' });
    expect(init.headers.Authorization).toBe(`Bearer ${MGMT_KEY}`);

    const saved = rows[0];
    expect(saved.keyHash).toBe('orhash123');
    expect(saved.limitUsd).toBe(500);
    expect(saved.encryptedKey).not.toContain(FAKE_SUB_KEY);
    // The reader decrypts it back under the sub-key binding.
    const read = await new TenantSubKeyReader(prisma, crypto()).getSubKey(TENANT);
    expect(read?.apiKey).toBe(FAKE_SUB_KEY);
    expect(read?.updatedAtMs).toEqual(expect.any(Number));
  });

  it('binds the envelope to the workspace: another workspace cannot decrypt it', async () => {
    fetchSpy.mockResolvedValue(ok({ key: FAKE_SUB_KEY, hash: 'orhash123' }));
    await service().ensureSubKey(TENANT);
    expect(() =>
      crypto().decrypt(rows[0].encryptedKey, rows[0].keyVersion, {
        tenantId: TENANT + 1,
        credentialPublicId: SUB_KEY_BINDING_ID,
      }),
    ).toThrow();
  });

  it('caps at the schema default ($200) when the workspace has no budget row yet', async () => {
    prisma.tenantAiBudget.findUnique.mockResolvedValue(null);
    fetchSpy.mockResolvedValue(ok({ key: FAKE_SUB_KEY, hash: 'h' }));
    await service().ensureSubKey(TENANT);
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body).limit).toBe(200);
  });

  it('is idempotent: an existing row short-circuits without a request', async () => {
    rows.push({
      tenantId: TENANT,
      keyHash: 'x',
      encryptedKey: 'aa:bb:cc',
      keyVersion: 1,
      limitUsd: 1,
      updatedAt: new Date(),
    });
    await expect(service().ensureSubKey(TENANT)).resolves.toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('with no provisioning key every method is a no-op: no request, no row', async () => {
    delete config.openRouterProvisioningKey;
    await expect(service().ensureSubKey(TENANT)).resolves.toBe(false);
    await expect(service().syncLimit(TENANT, 100)).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(rows).toHaveLength(0);
  });

  describe('no mint without the credentials key', () => {
    beforeEach(() => {
      delete config.aiCredentialsKey;
    });

    it('ensureSubKey sends no request to OpenRouter, stores nothing and resolves false', async () => {
      await expect(service().ensureSubKey(TENANT)).resolves.toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(rows).toHaveLength(0);
    });

    it('syncLimit with no row mints nothing either, however often it runs', async () => {
      const svc = service();
      for (let i = 0; i < 3; i++) await svc.syncLimit(TENANT, 100);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(rows).toHaveLength(0);
    });

    it('logs the reason once per process, not on every call', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const svc = service();
      await svc.ensureSubKey(TENANT);
      await svc.ensureSubKey(TENANT + 1);
      expect(warn.mock.calls.filter(([m]) => String(m).includes('AI_CREDENTIALS_KEY'))).toHaveLength(1);
    });
  });

  describe('revoke on a failed store', () => {
    it('a failed encrypt revokes the just-minted key by its hash and stores nothing', async () => {
      fetchSpy.mockResolvedValue(ok({ key: FAKE_SUB_KEY, hash: 'orhash-enc' }));
      const broken = crypto();
      jest.spyOn(broken, 'encrypt').mockImplementation(() => {
        throw new Error('cipher unavailable');
      });

      await expect(service(broken).ensureSubKey(TENANT)).resolves.toBe(false);

      const [revoke] = calls('DELETE');
      expect(revoke[0]).toBe('https://openrouter.ai/api/v1/keys/orhash-enc');
      expect(revoke[1].headers.Authorization).toBe(`Bearer ${MGMT_KEY}`);
      expect(rows).toHaveLength(0);
    });

    it('a failed row write revokes the just-minted key', async () => {
      fetchSpy.mockResolvedValue(ok({ key: FAKE_SUB_KEY, hash: 'orhash-db' }));
      prisma.tenantAiSubKey.create.mockRejectedValue(new Error('connection reset'));

      await expect(service().ensureSubKey(TENANT)).resolves.toBe(false);

      const [revoke] = calls('DELETE');
      expect(revoke[0]).toBe('https://openrouter.ai/api/v1/keys/orhash-db');
    });

    it('a failed revoke is logged at error level with the hash and never the key', async () => {
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      fetchSpy.mockImplementation(async (_url: string, init: any) =>
        init.method === 'DELETE'
          ? { ok: false, status: 503, json: async () => ({}) }
          : ok({ key: FAKE_SUB_KEY, hash: 'orhash-stuck' }),
      );
      prisma.tenantAiSubKey.create.mockRejectedValue(new Error('connection reset'));

      await expect(service().ensureSubKey(TENANT)).resolves.toBe(false);

      const lines = error.mock.calls.map(([m]) => String(m));
      expect(lines.some((l) => l.includes('orhash-stuck') && l.includes('by hand'))).toBe(true);
      expect(lines.join('\n')).not.toContain(FAKE_SUB_KEY);
      expect(lines.join('\n')).not.toContain(MGMT_KEY);
    });

    it('a lost create race (unique key) revokes the duplicate and keeps the stored key', async () => {
      fetchSpy.mockResolvedValue(ok({ key: FAKE_SUB_KEY, hash: 'orhash-dup' }));
      prisma.tenantAiSubKey.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));

      await expect(service().ensureSubKey(TENANT)).resolves.toBe(true);

      const [revoke] = calls('DELETE');
      expect(revoke[0]).toBe('https://openrouter.ai/api/v1/keys/orhash-dup');
    });
  });

  it('an HTTP failure on create stores nothing and revokes nothing (nothing was minted)', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
    await expect(service().ensureSubKey(TENANT)).resolves.toBe(false);
    expect(rows).toHaveLength(0);
    expect(calls('DELETE')).toHaveLength(0);
  });

  it('an unexpected create payload stores nothing; a hash alone is revoked', async () => {
    fetchSpy.mockResolvedValue(ok({ unexpected: true }));
    await expect(service().ensureSubKey(TENANT)).resolves.toBe(false);
    expect(rows).toHaveLength(0);

    fetchSpy.mockResolvedValue(ok({ data: { hash: 'orhash-nokey' } }));
    await expect(service().ensureSubKey(TENANT)).resolves.toBe(false);
    expect(calls('DELETE').map(([url]: any[]) => url)).toEqual(['https://openrouter.ai/api/v1/keys/orhash-nokey']);
  });

  it('a network throw during create degrades quietly', async () => {
    fetchSpy.mockRejectedValue(new Error('ECONNRESET'));
    await expect(service().ensureSubKey(TENANT)).resolves.toBe(false);
    expect(rows).toHaveLength(0);
  });

  it('a database error resolves false and never rejects (callers fire and forget)', async () => {
    prisma.tenantAiSubKey.findUnique.mockRejectedValue(new Error('pool exhausted'));
    await expect(service().ensureSubKey(TENANT)).resolves.toBe(false);
    await expect(service().syncLimit(TENANT, 100)).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  describe('syncLimit', () => {
    beforeEach(() => {
      rows.push({
        tenantId: TENANT,
        keyHash: 'orhash123',
        encryptedKey: 'aa:bb:cc',
        keyVersion: 1,
        limitUsd: '200',
        updatedAt: new Date(),
      });
    });

    it('PATCHes the limit by hash, monthly reset, and records it on the row', async () => {
      fetchSpy.mockResolvedValue(ok());
      await service().syncLimit(TENANT, 1500);
      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe('https://openrouter.ai/api/v1/keys/orhash123');
      expect(init.method).toBe('PATCH');
      expect(JSON.parse(init.body)).toEqual({ limit: 1500, limit_reset: 'monthly' });
      expect(rows[0].limitUsd).toBe(1500);
    });

    it('sends nothing when the limit is already the one stored', async () => {
      await service().syncLimit(TENANT, 200);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('a failed PATCH leaves the stored limit untouched', async () => {
      fetchSpy.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
      await service().syncLimit(TENANT, 999);
      expect(rows[0].limitUsd).toBe('200');
    });

    it('a network throw during PATCH degrades quietly', async () => {
      fetchSpy.mockRejectedValue(new Error('ETIMEDOUT'));
      await expect(service().syncLimit(TENANT, 999)).resolves.toBeUndefined();
    });
  });

  it('syncLimit with no row creates the key', async () => {
    fetchSpy.mockResolvedValue(ok({ key: FAKE_SUB_KEY, hash: 'h2' }));
    await service().syncLimit(TENANT, 25);
    expect(rows).toHaveLength(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/keys');
    expect(init.method).toBe('POST');
  });
});

describe('TenantSubKeyReader (degradation)', () => {
  const crypto = () => new CredentialCryptoService(new ConfigService({ aiCredentialsKey: CREDENTIALS_KEY }));

  it('returns null when the row is absent', async () => {
    const prisma = { tenantAiSubKey: { findUnique: jest.fn().mockResolvedValue(null) } } as any;
    expect(await new TenantSubKeyReader(prisma, crypto()).getSubKey(1)).toBeNull();
  });

  it('returns null when the envelope will not decrypt', async () => {
    const prisma = {
      tenantAiSubKey: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ encryptedKey: 'not:an:envelope', keyVersion: 1, updatedAt: new Date() }),
      },
    } as any;
    expect(await new TenantSubKeyReader(prisma, crypto()).getSubKey(1)).toBeNull();
  });

  it('returns null when the credentials key is gone', async () => {
    const sealed = crypto().encrypt('sk-or-x', { tenantId: 1, credentialPublicId: SUB_KEY_BINDING_ID });
    const prisma = {
      tenantAiSubKey: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ encryptedKey: sealed.ciphertext, keyVersion: sealed.keyVersion, updatedAt: new Date() }),
      },
    } as any;
    const keyless = new CredentialCryptoService(new ConfigService({}));
    expect(await new TenantSubKeyReader(prisma, keyless).getSubKey(1)).toBeNull();
  });

  it('returns null, never throws, when the read itself fails', async () => {
    const prisma = { tenantAiSubKey: { findUnique: jest.fn().mockRejectedValue(new Error('pool exhausted')) } } as any;
    await expect(new TenantSubKeyReader(prisma, crypto()).getSubKey(1)).resolves.toBeNull();
  });
});
