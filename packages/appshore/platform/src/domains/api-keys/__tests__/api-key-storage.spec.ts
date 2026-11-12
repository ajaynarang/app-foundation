import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Test } from '@nestjs/testing';
import { OutboxService } from '../../../infrastructure/events/outbox.service';
import { createMockOutbox } from '../../../test/mocks/outbox.mock';
import { ApiKeysService, hashApiKey } from '../api-keys.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';

/**
 * An API key is a password: the database holds only its sha256. These tests
 * fail if a plaintext column comes back, if the service stores or returns the
 * key anywhere except the one response that creates it, or if the lookup stops
 * going through the hash.
 */
describe('API key storage', () => {
  const dbRoot = join(__dirname, '../../../../../db/prisma');

  describe('schema', () => {
    const schema = readFileSync(join(dbRoot, 'schema/foundation.prisma'), 'utf8');
    const start = schema.indexOf('model ApiKey {');
    const model = schema.slice(start, schema.indexOf('\n}', start));

    it('stores a hash, a display prefix and the last four characters, and no key column', () => {
      expect(start).toBeGreaterThan(-1);
      expect(model).toMatch(/\bkeyHash\s+String\s+@unique/);
      expect(model).toMatch(/\bkeyPrefix\s+String/);
      expect(model).toMatch(/\bkeyLast4\s+String/);
      expect(model).not.toMatch(/^\s*key\s+String/m);
    });
  });

  describe('hashApiKey', () => {
    it('is sha256 over the UTF-8 bytes, as lowercase hex', () => {
      // Known-answer vector: sha256("abc").
      expect(hashApiKey('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
      const key = 'sk_live_' + '0123456789abcdefghijklmnopqrstuv';
      expect(hashApiKey(key)).toBe(createHash('sha256').update(Buffer.from(key, 'utf8')).digest('hex'));
      expect(hashApiKey(key)).toMatch(/^[0-9a-f]{64}$/);
    });

    it('matches the expression the migration uses to backfill existing rows', () => {
      // Postgres: encode(sha256(convert_to(key, 'UTF8')), 'hex') produces the
      // same lowercase hex digest as hashApiKey, so keys issued before the
      // migration still authenticate. If either side changes, they must change together.
      const sql = readFileSync(join(dbRoot, 'migrations/20261111090000_api_key_hash/migration.sql'), 'utf8');
      expect(sql).toContain(`"key_hash"   = encode(sha256(convert_to("key", 'UTF8')), 'hex')`);
      expect(sql).toMatch(/DROP COLUMN "key"/);
    });
  });

  describe('service', () => {
    const prisma = createMockPrisma();
    const events = createMockOutbox(prisma);
    let svc: ApiKeysService;

    const storedRow = (data: Record<string, unknown>) => ({
      id: 1,
      name: 'bi',
      userId: 42,
      scopes: ['platform:read'],
      ipAllowlist: [],
      rateLimitPerMinute: 300,
      isWriteEnabled: false,
      requestCount: 0,
      lastUsedAt: null,
      isActive: true,
      createdAt: new Date('2026-04-18T00:00:00Z'),
      expiresAt: null,
      revokedAt: null,
      ...data,
    });

    beforeEach(async () => {
      jest.clearAllMocks();
      const mod = await Test.createTestingModule({
        providers: [
          ApiKeysService,
          { provide: PrismaService, useValue: prisma },
          { provide: OutboxService, useValue: events },
        ],
      }).compile();
      svc = mod.get(ApiKeysService);
    });

    it('create persists only the hash, prefix and last four; the key appears once in the response', async () => {
      prisma.apiKey.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(storedRow(data)),
      );

      const out = await svc.create(42, { name: 'bi', scopes: ['platform:read'], ipAllowlist: [] });

      expect(out.key).toMatch(/^sk_live_[A-Za-z0-9_-]{32}$/);
      const { data } = prisma.apiKey.create.mock.calls[0][0];
      expect(data).not.toHaveProperty('key');
      expect(data.keyHash).toBe(hashApiKey(out.key));
      expect(data.keyPrefix).toBe('sk_live_');
      expect(data.keyLast4).toBe(out.key.slice(-4));
      expect(JSON.stringify(data)).not.toContain(out.key);
      expect(out.keyMasked).toBe(`sk_live_…${out.key.slice(-4)}`);
      expect(out).not.toHaveProperty('keyHash');
    });

    it('rotate persists only the hash of the new key and returns the key once', async () => {
      const oldHash = 'a'.repeat(64);
      const existing = storedRow({ id: 501, keyHash: oldHash, keyPrefix: 'sk_live_', keyLast4: 'AbCd' });
      prisma.apiKey.findFirst.mockResolvedValue(existing);
      // The revoke and the new row commit in one outbox transaction (the mock runs it on the client itself).
      prisma.apiKey.update.mockReturnValue(null);
      prisma.apiKey.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        storedRow({ ...data, id: 502 }),
      );

      const out = await svc.rotate(501, 7);

      const { data } = prisma.apiKey.create.mock.calls[0][0];
      expect(data).not.toHaveProperty('key');
      expect(data.keyHash).toBe(hashApiKey(out.plaintextKey));
      expect(data.keyHash).not.toBe(oldHash);
      expect(JSON.stringify(data)).not.toContain(out.plaintextKey);
      expect(out.apiKey).not.toHaveProperty('key');
      expect(out.apiKey.keyMasked).toBe(`sk_live_…${out.plaintextKey.slice(-4)}`);
    });

    it('lists return the masked form and never a key or hash', async () => {
      const row = storedRow({ keyHash: 'a'.repeat(64), keyPrefix: 'sk_live_', keyLast4: 'AbCd' });
      prisma.apiKey.findMany.mockResolvedValue([row]);
      prisma.apiKey.count.mockResolvedValue(1);

      const [own] = (await svc.findAll(42)).items;
      const [tenant] = (await svc.listForTenant(7)).items;

      for (const item of [own, tenant]) {
        expect(item.keyMasked).toBe('sk_live_…AbCd');
        expect(item).not.toHaveProperty('key');
        expect(item).not.toHaveProperty('keyHash');
      }
    });

    it('validateKey looks the key up by its hash, never by the plaintext', async () => {
      prisma.apiKey.findUnique.mockResolvedValue(null);

      await svc.validateKey('sk_live_presented');

      const { where } = prisma.apiKey.findUnique.mock.calls[0][0];
      expect(where).toEqual({ keyHash: hashApiKey('sk_live_presented') });
      expect(JSON.stringify(where)).not.toContain('sk_live_presented');
    });
  });
});
