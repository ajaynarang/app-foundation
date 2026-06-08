import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DomainEventService } from '../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../infrastructure/events/sally-events.constants';
import { nanoid } from 'nanoid';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { ApiKeyDto } from './dto/api-key.dto';
import { TenantApiKeyListItemDto } from './dto/list-api-keys.dto';
import { UpdateApiKeyScopesDto } from './dto/update-api-key-scopes.dto';
import { AgentScope, NEVER_EXTERNAL_SCOPES } from '@sally/shared-types';

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
        'IP allowlist is required when a key has any write-tier scope (fleet:write, loads:write, comms:send, etc.). Use 0.0.0.0/0 to explicitly allow any IP.',
      );
    }

    const key = 'sk_live_' + nanoid(32);

    const apiKey = await this.prisma.apiKey.create({
      data: {
        key,
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

    return this.toDto(apiKey, { includeSecret: true });
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
   * Sally's Desk admin view (Phase D). Never returns the plaintext key.
   */
  async listForTenant(tenantId: number): Promise<TenantApiKeyListItemDto[]> {
    const keys = await this.prisma.apiKey.findMany({
      where: { user: { tenantId } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
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
      keyMasked: `sk_live_${'*'.repeat(24)}…`,
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
  async revokeForTenant(id: number, tenantId: number): Promise<void> {
    const apiKey = await this.findTenantKeyOrThrow(id, tenantId);
    await this.prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { revokedAt: new Date(), isActive: false },
    });
    await this.events.emit(SALLY_EVENTS.API_KEY_REVOKED, String(tenantId), {
      apiKeyId: apiKey.id,
      name: apiKey.name,
    });
  }

  /** Toggle isActive=false. No secret change. Reversible via resume(). */
  async pause(id: number, tenantId: number): Promise<void> {
    const apiKey = await this.findTenantKeyOrThrow(id, tenantId);
    if (apiKey.revokedAt) {
      throw new BadRequestException('Cannot pause a revoked key');
    }
    await this.prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { isActive: false },
    });
    await this.events.emit(SALLY_EVENTS.API_KEY_PAUSED, String(tenantId), {
      apiKeyId: apiKey.id,
      name: apiKey.name,
    });
  }

  async resume(id: number, tenantId: number): Promise<void> {
    const apiKey = await this.findTenantKeyOrThrow(id, tenantId);
    if (apiKey.revokedAt) {
      throw new BadRequestException('Cannot resume a revoked key');
    }
    await this.prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { isActive: true },
    });
    await this.events.emit(SALLY_EVENTS.API_KEY_RESUMED, String(tenantId), {
      apiKeyId: apiKey.id,
      name: apiKey.name,
    });
  }

  /**
   * Rotate a key: revoke the old row, then create a brand-new row that
   * preserves the same scopes / ipAllowlist / rateLimitPerMinute / userId.
   * Returns the new plaintext key (shown once on the UI).
   */
  async rotate(id: number, tenantId: number): Promise<{ apiKey: ApiKeyDto; plaintextKey: string }> {
    const existing = await this.findTenantKeyOrThrow(id, tenantId);
    if (existing.revokedAt) {
      throw new BadRequestException('Cannot rotate a revoked key');
    }
    const plaintextKey = 'sk_live_' + nanoid(32);

    const [, created] = await this.prisma.$transaction([
      this.prisma.apiKey.update({
        where: { id: existing.id },
        data: { revokedAt: new Date(), isActive: false },
      }),
      this.prisma.apiKey.create({
        data: {
          key: plaintextKey,
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

    await this.events.emit(SALLY_EVENTS.API_KEY_ROTATED, String(tenantId), {
      oldApiKeyId: existing.id,
      newApiKeyId: created.id,
      name: existing.name,
    });

    return {
      apiKey: this.toDto(created, { includeSecret: false }),
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
      throw new BadRequestException('Cannot update scopes on a revoked key');
    }

    this.assertScopesAreGrantable(dto.scopes);
    const writeEnabled = hasWriteScope(dto.scopes);
    const nextIpAllowlist = dto.ipAllowlist ?? existing.ipAllowlist;

    if (writeEnabled && nextIpAllowlist.length === 0) {
      throw new BadRequestException(
        'IP allowlist is required when a key has any write-tier scope (fleet:write, loads:write, comms:send, etc.). Use 0.0.0.0/0 to explicitly allow any IP.',
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

    await this.events.emit(SALLY_EVENTS.API_KEY_SCOPES_UPDATED, String(tenantId), {
      apiKeyId: updated.id,
      name: updated.name,
      scopes: dto.scopes,
    });

    return this.toDto(updated);
  }

  async validateKey(key: string, context: ValidateKeyContext = {}) {
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { key },
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
      key: string;
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
    options: { includeSecret?: boolean } = {},
  ): ApiKeyDto {
    return {
      id: apiKey.id,
      ...(options.includeSecret ? { key: apiKey.key } : {}),
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
