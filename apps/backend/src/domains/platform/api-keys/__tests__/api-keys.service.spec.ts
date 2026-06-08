import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ApiKeysService } from '../api-keys.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { createMockPrisma } from '../../../../test/mocks/prisma.mock';

describe('ApiKeysService — scoped keys (Phase B)', () => {
  const prisma = createMockPrisma();
  const events = { emit: jest.fn() };
  let svc: ApiKeysService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        ApiKeysService,
        { provide: PrismaService, useValue: prisma },
        { provide: DomainEventService, useValue: events },
      ],
    }).compile();
    svc = mod.get(ApiKeysService);
  });

  const baseRow = {
    id: 'ak0',
    key: 'sk_live_0',
    name: 'bi',
    scopes: ['fleet:read'],
    ipAllowlist: [],
    rateLimitPerMinute: 300,
    isWriteEnabled: false,
    requestCount: 0,
    lastUsedAt: null,
    isActive: true,
    createdAt: new Date('2026-04-18T00:00:00Z'),
    expiresAt: null,
    userId: 42,
    revokedAt: null,
    lastValidationError: null,
  };

  it('create rejects a write scope without an IP allowlist', async () => {
    // Write-tier scopes MUST declare an IP policy. Users can opt out of
    // filtering by passing `0.0.0.0/0` but may not leave the list empty.
    await expect(
      svc.create(42, {
        name: 'bi',
        scopes: ['invoices:write'],
        ipAllowlist: [],
      }),
    ).rejects.toThrow(/IP allowlist is required/);
    expect(prisma.apiKey.create).not.toHaveBeenCalled();
  });

  it('create accepts 0.0.0.0/0 as the "allow any IP" opt-out', async () => {
    prisma.apiKey.create.mockResolvedValue({
      ...baseRow,
      scopes: ['invoices:write'],
      ipAllowlist: ['0.0.0.0/0'],
      isWriteEnabled: true,
    });
    const out = await svc.create(42, {
      name: 'bi',
      scopes: ['invoices:write'],
      ipAllowlist: ['0.0.0.0/0'],
    });
    expect(out.isWriteEnabled).toBe(true);
    expect(out.ipAllowlist).toEqual(['0.0.0.0/0']);
  });

  it('create sets isWriteEnabled=true for a plain :write scope (fleet:write)', async () => {
    prisma.apiKey.create.mockResolvedValue({
      ...baseRow,
      scopes: ['fleet:write'],
      isWriteEnabled: true,
      ipAllowlist: ['0.0.0.0/0'],
    });
    const out = await svc.create(42, {
      name: 'rw',
      scopes: ['fleet:write'],
      ipAllowlist: ['0.0.0.0/0'],
    });
    expect(out.isWriteEnabled).toBe(true);
  });

  it('create sets isWriteEnabled=true for comms:send (not a :write scope but triggers the write flag)', async () => {
    prisma.apiKey.create.mockResolvedValue({
      ...baseRow,
      scopes: ['comms:send'],
      isWriteEnabled: true,
      ipAllowlist: ['0.0.0.0/0'],
    });
    const out = await svc.create(42, {
      name: 'notify',
      scopes: ['comms:send'],
      ipAllowlist: ['0.0.0.0/0'],
    });
    expect(out.isWriteEnabled).toBe(true);
  });

  it('create persists scopes, ipAllowlist, rateLimitPerMinute, isWriteEnabled', async () => {
    prisma.apiKey.create.mockResolvedValue({
      ...baseRow,
      scopes: ['invoices:write'],
      ipAllowlist: ['10.0.0.1'],
      rateLimitPerMinute: 120,
      isWriteEnabled: true,
    });
    await svc.create(42, {
      name: 'bi',
      scopes: ['invoices:write'],
      ipAllowlist: ['10.0.0.1'],
      rateLimitPerMinute: 120,
    });
    expect(prisma.apiKey.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scopes: ['invoices:write'],
          ipAllowlist: ['10.0.0.1'],
          rateLimitPerMinute: 120,
          isWriteEnabled: true,
        }),
      }),
    );
  });

  it('create hard-blocks platform:admin at the service boundary', async () => {
    await expect(
      svc.create(42, {
        name: 'bad',
        scopes: ['platform:admin'] as any,
        ipAllowlist: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.apiKey.create).not.toHaveBeenCalled();
  });

  it('create returns createdAt / lastUsedAt / expiresAt as ISO strings', async () => {
    prisma.apiKey.create.mockResolvedValue({
      ...baseRow,
      lastUsedAt: new Date('2026-04-18T10:00:00Z'),
      expiresAt: new Date('2026-06-18T10:00:00Z'),
    });
    const out = await svc.create(42, {
      name: 'bi',
      scopes: ['fleet:read'],
      ipAllowlist: [],
    });
    expect(out.createdAt).toBe('2026-04-18T00:00:00.000Z');
    expect(out.lastUsedAt).toBe('2026-04-18T10:00:00.000Z');
    expect(out.expiresAt).toBe('2026-06-18T10:00:00.000Z');
  });

  it('validateKey returns null when IP is not in the allowlist', async () => {
    prisma.apiKey.findUnique.mockResolvedValue({
      ...baseRow,
      key: 'sk_live_x',
      ipAllowlist: ['10.0.0.1'],
      user: { id: 42 },
    });
    const out = await svc.validateKey('sk_live_x', { ip: '192.168.1.100' });
    expect(out).toBeNull();
  });

  it('validateKey allows exact-match IP', async () => {
    prisma.apiKey.findUnique.mockResolvedValue({
      ...baseRow,
      key: 'sk_live_x',
      ipAllowlist: ['10.0.0.1'],
      user: { id: 42 },
    });
    prisma.apiKey.update.mockResolvedValue({});
    const out = await svc.validateKey('sk_live_x', { ip: '10.0.0.1' });
    expect(out).toBeTruthy();
    expect(out?.scopes).toEqual(['fleet:read']);
  });

  it('validateKey allows CIDR-match IP', async () => {
    prisma.apiKey.findUnique.mockResolvedValue({
      ...baseRow,
      key: 'sk_live_x',
      ipAllowlist: ['10.0.0.0/24'],
      user: { id: 42 },
    });
    prisma.apiKey.update.mockResolvedValue({});
    const out = await svc.validateKey('sk_live_x', { ip: '10.0.0.199' });
    expect(out).toBeTruthy();
  });

  it('validateKey rejects IP outside a /24 subnet (boundary case)', async () => {
    prisma.apiKey.findUnique.mockResolvedValue({
      ...baseRow,
      key: 'sk_live_x',
      ipAllowlist: ['10.0.0.0/24'],
      user: { id: 42 },
    });
    const out = await svc.validateKey('sk_live_x', { ip: '10.0.1.0' });
    expect(out).toBeNull();
  });

  it('validateKey allows any IP when allowlist is empty', async () => {
    prisma.apiKey.findUnique.mockResolvedValue({
      ...baseRow,
      key: 'sk_live_x',
      ipAllowlist: [],
      user: { id: 42 },
    });
    prisma.apiKey.update.mockResolvedValue({});
    const out = await svc.validateKey('sk_live_x', { ip: '192.168.1.100' });
    expect(out).toBeTruthy();
  });

  it('validateKey returns null when the key is inactive or revoked or expired', async () => {
    prisma.apiKey.findUnique.mockResolvedValue(null);
    expect(await svc.validateKey('missing')).toBeNull();

    prisma.apiKey.findUnique.mockResolvedValue({
      ...baseRow,
      isActive: false,
      user: { id: 42 },
    });
    expect(await svc.validateKey('sk_live_x')).toBeNull();

    prisma.apiKey.findUnique.mockResolvedValue({
      ...baseRow,
      revokedAt: new Date(),
      user: { id: 42 },
    });
    expect(await svc.validateKey('sk_live_x')).toBeNull();

    prisma.apiKey.findUnique.mockResolvedValue({
      ...baseRow,
      expiresAt: new Date(Date.now() - 1000),
      user: { id: 42 },
    });
    expect(await svc.validateKey('sk_live_x')).toBeNull();
  });
});
