import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { DomainEventService } from '@appshore/kernel/infrastructure/events/domain-event.service';
import { FOUNDATION_DOMAIN_EVENTS as DOMAIN_EVENTS } from '@appshore/kernel/infrastructure/events/foundation-events';
import { createHash } from 'crypto';
import { nanoid } from 'nanoid';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { ApiKeyDto } from './dto/api-key.dto';
import { TenantApiKeyListItemDto } from './dto/list-api-keys.dto';
import { UpdateApiKeyScopesDto } from './dto/update-api-key-scopes.dto';
import { AgentScope, NEVER_EXTERNAL_SCOPES } from '@app/shared-types';
import { invalidState } from '@appshore/kernel/shared/errors/api-errors';

/**
 * IPv4 CIDR containment check. Returns true when `ip` is inside `cidr`.
 * Bare `a.b.c.d` matches exactly; `a.b.c.d/NN` matches the masked network.
 * Inputs are trusted to be valid IPv4/CIDR (validated at DTO layer by @Matches).
 */
function cidrContains(cidr: string, ip: string): boolean {
  if (!cidr.includes('/')) return cidr === ip;
  const [network, bitsStr] = cidr.split('/');
  const bits = parseInt(bitsStr, 10);
  const toInt = (addr: string) => addr.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0) >>> 0;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (toInt(network) & mask) === (toInt(ip) & mask);
}

/** Returns true when any scope in the set would allow a write-tier action. */
function hasWriteScope(scopes: AgentScope[]): boolean {
  return scopes.some((s) => s.includes(':write') || s === 'comms:send' || s === 'comms:send:bulk');
}

const KEY_PREFIX = 'sk_live_';

/**
 * An API key is a password: the database holds only this sha256 (lowercase
 * hex over the UTF-8 bytes). The key itself carries 32 random nanoid
 * characters, so an unsalted fast hash is enough and allows lookup by index.
 */
export function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext, 'utf8').digest('hex');
}

/** Mint a new key. `plaintext` goes to the caller once; the rest is what gets stored. */
function mintKey(): { plaintext: string; keyHash: string; keyPrefix: string; keyLast4: string } {
  const plaintext = KEY_PREFIX + nanoid(32);
  return { plaintext, keyHash: hashApiKey(plaintext), keyPrefix: KEY_PREFIX, keyLast4: plaintext.slice(-4) };
}

/** Display form for lists, e.g. `sk_live_…AbCd`. */
function maskKey(row: { keyPrefix: string; keyLast4: string }): string {
  return `${row.keyPrefix}…${row.keyLast4}`;
}

export interface ValidateKeyContext {
  ip?: string;
}

@Injectable()
export class ApiKeysService {
  private readonly logger = new Logger(ApiKeysService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventService,
  ) {}

  async create(userId: number, dto: CreateApiKeyDto): Promise<ApiKeyDto> {
    this.assertScopesAreGrantable(dto.scopes);
    const writeEnabled = hasWriteScope(dto.scopes);
    const ipAllowlist = dto.ipAllowlist ?? [];

    // Write-scoped keys MUST carry an explicit IP policy. "Allow any IP" is
    // still allowed — users can set `0.0.0.0/0` (the "all addresses" CIDR) —
    // but forcing the field means every write key has a recorded decision,
    // never a silent any-IP default. Matches Phase B plan exit criterion #4.
    if (writeEnabled && ipAllowlist.length === 0) {
      throw new BadRequestException(
        'IP allowlist is required when a key has any write-tier scope (platform:write, documents:write, comms:send, etc.). Use 0.0.0.0/0 to explicitly allow any IP.',
      );
    }

    const { plaintext, ...stored } = mintKey();

    const apiKey = await this.prisma.apiKey.create({
      data: {
        ...stored,
        name: dto.name,
        userId,
        scopes: dto.scopes,
        ipAllowlist,
        rateLimitPerMinute: dto.rateLimitPerMinute ?? 300,
        isWriteEnabled: writeEnabled,
        isActive: true,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });

    return this.toDto(apiKey, plaintext);
  }

  async findAll(userId: number): Promise<ApiKeyDto[]> {
    const keys = await this.prisma.apiKey.findMany({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return keys.map((k) => this.toDto(k));
  }

  /**
   * List every API key in a tenant, scoped via `user.tenantId`. Used by the
   * the Desk admin view (Phase D). The plaintext key is not stored, so it cannot be returned.
   */
  async listForTenant(tenantId: number): Promise<TenantApiKeyListItemDto[]> {
    const keys = await this.prisma.apiKey.findMany({
      where: { user: { tenantId } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        keyPrefix: true,
        keyLast4: true,
        name: true,
        userId: true,
        scopes: true,
        ipAllowlist: true,
        rateLimitPerMinute: true,
        isWriteEnabled: true,
        isActive: true,
        lastUsedAt: true,
        requestCount: true,
        createdAt: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
    return keys.map((k) => ({
      id: k.id,
      name: k.name,
      keyMasked: maskKey(k),
      userId: k.userId,
      scopes: k.scopes as AgentScope[],
      ipAllowlist: k.ipAllowlist,
      rateLimitPerMinute: k.rateLimitPerMinute,
      isWriteEnabled: k.isWriteEnabled,
      isActive: k.isActive,
      lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
      requestCount: k.requestCount,
      createdAt: k.createdAt.toISOString(),
      expiresAt: k.expiresAt?.toISOString() ?? null,
      revokedAt: k.revokedAt?.toISOString() ?? null,
    }));
  }

  async revoke(id: number, userId: number): Promise<void> {
    const apiKey = await this.prisma.apiKey.findFirst({
      where: { id, userId },
    });
    if (!apiKey) throw new NotFoundException('API key not found');
    await this.prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date(), isActive: false },
    });
  }

  /** Tenant-scoped revoke — used by tenant-admin flows (Desk). */
  async revokeForTenant(id: number, tenantId: number): Promise<ApiKeyDto> {
    const apiKey = await this.findTenantKeyOrThrow(id, tenantId);
    const updated = await this.prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { revokedAt: new Date(), isActive: false },
    });
    await this.events.emit(DOMAIN_EVENTS.API_KEY_REVOKED, String(tenantId), {
      apiKeyId: apiKey.id,
      name: apiKey.name,
    });
    return this.toDto(updated);
  }

  /** Toggle isActive=false. No secret change. Reversible via resume(). */
  async pause(id: number, tenantId: number): Promise<ApiKeyDto> {
    const apiKey = await this.findTenantKeyOrThrow(id, tenantId);
    if (apiKey.revokedAt) {
      throw invalidState('A revoked key cannot be paused');
    }
    const updated = await this.prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { isActive: false },
    });
    await this.events.emit(DOMAIN_EVENTS.API_KEY_PAUSED, String(tenantId), {
      apiKeyId: apiKey.id,
      name: apiKey.name,
    });
    return this.toDto(updated);
  }

  async resume(id: number, tenantId: number): Promise<ApiKeyDto> {
    const apiKey = await this.findTenantKeyOrThrow(id, tenantId);
    if (apiKey.revokedAt) {
      throw invalidState('A revoked key cannot be resumed');
    }
    const updated = await this.prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { isActive: true },
    });
    await this.events.emit(DOMAIN_EVENTS.API_KEY_RESUMED, String(tenantId), {
      apiKeyId: apiKey.id,
      name: apiKey.name,
    });
    return this.toDto(updated);
  }

  /**
   * Rotate a key: revoke the old row, then create a brand-new row that
   * preserves the same scopes / ipAllowlist / rateLimitPerMinute / userId.
   * Returns the new plaintext key (shown once on the UI).
   */
  async rotate(id: number, tenantId: number): Promise<{ apiKey: ApiKeyDto; plaintextKey: string }> {
    const existing = await this.findTenantKeyOrThrow(id, tenantId);
    if (existing.revokedAt) {
      throw invalidState('A revoked key cannot be rotated');
    }
    const { plaintext: plaintextKey, ...stored } = mintKey();

    const [, created] = await this.prisma.$transaction([
      this.prisma.apiKey.update({
        where: { id: existing.id },
        data: { revokedAt: new Date(), isActive: false },
      }),
      this.prisma.apiKey.create({
        data: {
          ...stored,
          name: existing.name,
          userId: existing.userId,
          scopes: existing.scopes,
          ipAllowlist: existing.ipAllowlist,
          rateLimitPerMinute: existing.rateLimitPerMinute,
          isWriteEnabled: existing.isWriteEnabled,
          isActive: true,
          expiresAt: existing.expiresAt,
        },
      }),
    ]);

    await this.events.emit(DOMAIN_EVENTS.API_KEY_ROTATED, String(tenantId), {
      oldApiKeyId: existing.id,
      newApiKeyId: created.id,
      name: existing.name,
    });

    return {
      apiKey: this.toDto(created),
      plaintextKey,
    };
  }

  /**
   * Update the scopes / ipAllowlist / rateLimitPerMinute on an existing key.
   * Rejects platform:admin and any unknown scope. If the new scope set
   * contains a write-tier scope, the key MUST carry a non-empty IP allowlist.
   */
  async updateScopes(id: number, tenantId: number, dto: UpdateApiKeyScopesDto): Promise<ApiKeyDto> {
    const existing = await this.findTenantKeyOrThrow(id, tenantId);
    if (existing.revokedAt) {
      throw invalidState('A revoked key cannot change its scopes');
    }

    this.assertScopesAreGrantable(dto.scopes);
    const writeEnabled = hasWriteScope(dto.scopes);
    const nextIpAllowlist = dto.ipAllowlist ?? existing.ipAllowlist;

    if (writeEnabled && nextIpAllowlist.length === 0) {
      throw new BadRequestException(
        'IP allowlist is required when a key has any write-tier scope (platform:write, documents:write, comms:send, etc.). Use 0.0.0.0/0 to explicitly allow any IP.',
      );
    }

    const updated = await this.prisma.apiKey.update({
      where: { id: existing.id },
      data: {
        scopes: dto.scopes,
        ipAllowlist: nextIpAllowlist,
        rateLimitPerMinute: dto.rateLimitPerMinute ?? existing.rateLimitPerMinute,
        isWriteEnabled: writeEnabled,
      },
    });

    await this.events.emit(DOMAIN_EVENTS.API_KEY_SCOPES_UPDATED, String(tenantId), {
      apiKeyId: updated.id,
      name: updated.name,
      scopes: dto.scopes,
    });

    return this.toDto(updated);
  }

  async validateKey(plaintext: string, context: ValidateKeyContext = {}) {
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { keyHash: hashApiKey(plaintext) },
      include: { user: true },
    });
    if (!apiKey || !apiKey.isActive || apiKey.revokedAt) return null;
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) return null;

    if (apiKey.ipAllowlist.length > 0 && context.ip) {
      const allowed = apiKey.ipAllowlist.some((cidr) => cidrContains(cidr, context.ip));
      if (!allowed) {
        this.logger.warn(`api-key ${apiKey.id} rejected: ip ${context.ip} not in allowlist`);
        return null;
      }
    }

    this.prisma.apiKey
      .update({
        where: { id: apiKey.id },
        data: { lastUsedAt: new Date(), requestCount: { increment: 1 } },
      })
      .catch((err: Error) => this.logger.error('Failed to update API key usage:', err));

    return apiKey;
  }

  private async findTenantKeyOrThrow(id: number, tenantId: number) {
    const apiKey = await this.prisma.apiKey.findFirst({
      where: { id, user: { tenantId } },
    });
    if (!apiKey) throw new NotFoundException('API key not found');
    return apiKey;
  }

  private assertScopesAreGrantable(scopes: AgentScope[]): void {
    const forbidden = scopes.filter((s) => (NEVER_EXTERNAL_SCOPES as readonly string[]).includes(s));
    if (forbidden.length > 0) {
      throw new BadRequestException(`These scopes cannot be granted to API keys: ${forbidden.join(', ')}`);
    }
  }

  private toDto(
    apiKey: {
      id: number;
      keyPrefix: string;
      keyLast4: string;
      name: string;
      scopes: string[];
      ipAllowlist: string[];
      rateLimitPerMinute: number;
      isWriteEnabled: boolean;
      requestCount: number;
      lastUsedAt: Date | null;
      isActive: boolean;
      createdAt: Date;
      expiresAt: Date | null;
    },
    plaintextKey?: string,
  ): ApiKeyDto {
    return {
      id: apiKey.id,
      ...(plaintextKey ? { key: plaintextKey } : {}),
      keyMasked: maskKey(apiKey),
      name: apiKey.name,
      scopes: apiKey.scopes as AgentScope[],
      ipAllowlist: apiKey.ipAllowlist,
      rateLimitPerMinute: apiKey.rateLimitPerMinute,
      isWriteEnabled: apiKey.isWriteEnabled,
      requestCount: apiKey.requestCount,
      lastUsedAt: apiKey.lastUsedAt?.toISOString() ?? null,
      isActive: apiKey.isActive,
      createdAt: apiKey.createdAt.toISOString(),
      expiresAt: apiKey.expiresAt?.toISOString() ?? null,
    };
  }
}
