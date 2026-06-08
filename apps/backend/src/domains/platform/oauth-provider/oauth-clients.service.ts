import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../infrastructure/cache/sally-cache.service';
import { buildKey } from '../../../infrastructure/cache/cache-key.constants';
import { CACHE_TTL_WARM_5M } from '../../../constants/cache.constants';
import { DomainEventService } from '../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../infrastructure/events/sally-events.constants';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { nanoid } from 'nanoid';
import { AgentScopeSchema, NEVER_EXTERNAL_SCOPES } from '@sally/shared-types';
import type {
  AgentScope,
  CreateOAuthClientInput,
  UpdateOAuthClientInput,
  OAuthClientResponse,
  OAuthClientCreatedResponse,
} from '@sally/shared-types';
import { UpdateOAuthClientScopesDto } from './dto/update-oauth-client-scopes.dto';

@Injectable()
export class OAuthClientsService {
  private readonly logger = new Logger(OAuthClientsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: SallyCacheService,
    private readonly events: DomainEventService,
  ) {}

  async create(
    input: CreateOAuthClientInput,
    userId: number | null,
    tenantId: number | null,
  ): Promise<OAuthClientCreatedResponse> {
    this.assertScopesAreGrantable(input.scopes as AgentScope[]);

    const clientIdValue = `sally_${nanoid(32)}`;
    const rawSecret = crypto.randomBytes(32).toString('hex');
    const hashedSecret = await bcrypt.hash(rawSecret, 10);

    const client = await this.prisma.oAuthClient.create({
      data: {
        clientId: clientIdValue,
        clientSecret: hashedSecret,
        name: input.name,
        description: input.description ?? null,
        redirectUris: input.redirectUris,
        scopes: input.scopes,
        clientType: input.clientType ?? 'confidential',
        tenantId,
        createdByUserId: userId,
      },
    });

    await this.invalidateOAuthClientsCache(tenantId);

    return {
      clientId: client.clientId,
      clientSecret: rawSecret, // Only returned once
      name: client.name,
      description: client.description,
      redirectUris: client.redirectUris,
      scopes: client.scopes,
      clientType: client.clientType,
      isActive: client.isActive,
      createdAt: client.createdAt.toISOString(),
    };
  }

  async findAll(tenantId: number | null): Promise<OAuthClientResponse[]> {
    const cacheKey = buildKey('sally:oauth', 'clients', String(tenantId ?? 'global'));
    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const clients = await this.prisma.oAuthClient.findMany({
          where: tenantId ? { tenantId } : { tenantId: null },
          orderBy: { createdAt: 'desc' },
        });

        return clients.map((c) => ({
          clientId: c.clientId,
          name: c.name,
          description: c.description,
          redirectUris: c.redirectUris,
          scopes: c.scopes,
          clientType: c.clientType,
          isActive: c.isActive,
          createdAt: c.createdAt.toISOString(),
        }));
      },
      CACHE_TTL_WARM_5M,
    );
  }

  async findByClientId(clientId: string, tenantId: number | null): Promise<OAuthClientResponse> {
    const client = await this.loadClientOrThrow(clientId, tenantId);
    return {
      clientId: client.clientId,
      name: client.name,
      description: client.description,
      redirectUris: client.redirectUris,
      scopes: client.scopes,
      clientType: client.clientType,
      isActive: client.isActive,
      createdAt: client.createdAt.toISOString(),
    };
  }

  async update(clientId: string, input: UpdateOAuthClientInput, tenantId: number | null): Promise<OAuthClientResponse> {
    await this.loadClientOrThrow(clientId, tenantId);

    if (input.scopes !== undefined) {
      this.assertScopesAreGrantable(input.scopes as AgentScope[]);
    }

    const updated = await this.prisma.oAuthClient.update({
      where: { clientId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.redirectUris !== undefined ? { redirectUris: input.redirectUris } : {}),
        ...(input.scopes !== undefined ? { scopes: input.scopes } : {}),
      },
    });

    await this.invalidateOAuthClientsCache(tenantId);

    return {
      clientId: updated.clientId,
      name: updated.name,
      description: updated.description,
      redirectUris: updated.redirectUris,
      scopes: updated.scopes,
      clientType: updated.clientType,
      isActive: updated.isActive,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  /**
   * Revoke an OAuth client. Cascades to active access + refresh tokens in a
   * single transaction so existing issued tokens can no longer mint new ones.
   * This matches the OAuth 2.1 convention for revocation.
   */
  async revoke(clientId: string, tenantId: number | null): Promise<void> {
    const client = await this.loadClientOrThrow(clientId, tenantId);

    await this.prisma.$transaction([
      this.prisma.oAuthAccessToken.updateMany({
        where: { clientId: client.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.oAuthRefreshToken.updateMany({
        where: { clientId: client.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.oAuthClient.update({
        where: { clientId },
        data: { isActive: false },
      }),
    ]);

    await this.invalidateOAuthClientsCache(tenantId);
    await this.events.emit(SALLY_EVENTS.OAUTH_CLIENT_REVOKED, String(tenantId ?? 'global'), {
      clientId: client.clientId,
      name: client.name,
    });
  }

  /** Toggle isActive=false without cascading token revocation. Reversible via resume. */
  async pause(clientId: string, tenantId: number | null): Promise<void> {
    const client = await this.loadClientOrThrow(clientId, tenantId);
    await this.assertNotRevoked(client);
    if (!client.isActive) {
      throw new BadRequestException('Client is already paused');
    }
    await this.prisma.oAuthClient.update({
      where: { clientId },
      data: { isActive: false },
    });
    await this.invalidateOAuthClientsCache(tenantId);
    await this.events.emit(SALLY_EVENTS.OAUTH_CLIENT_PAUSED, String(tenantId ?? 'global'), {
      clientId: client.clientId,
      name: client.name,
    });
  }

  async resume(clientId: string, tenantId: number | null): Promise<void> {
    const client = await this.loadClientOrThrow(clientId, tenantId);
    await this.assertNotRevoked(client);
    if (client.isActive) {
      throw new BadRequestException('Client is already active');
    }
    await this.prisma.oAuthClient.update({
      where: { clientId },
      data: { isActive: true },
    });
    await this.invalidateOAuthClientsCache(tenantId);
    await this.events.emit(SALLY_EVENTS.OAUTH_CLIENT_RESUMED, String(tenantId ?? 'global'), {
      clientId: client.clientId,
      name: client.name,
    });
  }

  /**
   * Rotate the client secret.
   *
   * Per OAuth 2.1 convention, rotating the secret does NOT cascade-revoke
   * existing access or refresh tokens — they continue to be valid because
   * they were signed at issue time, not verified against the current secret.
   * Only new client_credentials / authorization_code handshakes with this
   * client will fail until callers update to the new secret.
   *
   * If you also want to cut existing tokens, call `revoke()` instead.
   */
  async rotateSecret(clientId: string, tenantId: number | null): Promise<{ clientSecret: string }> {
    const client = await this.loadClientOrThrow(clientId, tenantId);
    await this.assertNotRevoked(client);
    const rawSecret = crypto.randomBytes(32).toString('hex');
    const hashedSecret = await bcrypt.hash(rawSecret, 10);

    await this.prisma.oAuthClient.update({
      where: { clientId },
      data: { clientSecret: hashedSecret },
    });

    await this.invalidateOAuthClientsCache(tenantId);
    await this.events.emit(SALLY_EVENTS.OAUTH_CLIENT_ROTATED, String(tenantId ?? 'global'), {
      clientId: client.clientId,
      name: client.name,
    });

    return { clientSecret: rawSecret };
  }

  /**
   * Replace the grantable scope set on an OAuth client. Non-enum and
   * platform:admin scopes are rejected. Existing access tokens carry
   * their issued scopes; only future token mints will reflect the change.
   */
  async updateScopes(
    clientId: string,
    tenantId: number | null,
    dto: UpdateOAuthClientScopesDto,
  ): Promise<OAuthClientResponse> {
    const client = await this.loadClientOrThrow(clientId, tenantId);
    await this.assertNotRevoked(client);

    // Validate every scope against the shared enum (hard parse).
    for (const scope of dto.scopes) {
      AgentScopeSchema.parse(scope);
    }
    this.assertScopesAreGrantable(dto.scopes);

    const updated = await this.prisma.oAuthClient.update({
      where: { clientId },
      data: { scopes: dto.scopes },
    });

    await this.invalidateOAuthClientsCache(tenantId);
    await this.events.emit(SALLY_EVENTS.OAUTH_CLIENT_SCOPES_UPDATED, String(tenantId ?? 'global'), {
      clientId: client.clientId,
      name: client.name,
      scopes: dto.scopes,
    });

    return {
      clientId: updated.clientId,
      name: updated.name,
      description: updated.description,
      redirectUris: updated.redirectUris,
      scopes: updated.scopes,
      clientType: updated.clientType,
      isActive: updated.isActive,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  private async loadClientOrThrow(clientId: string, tenantId: number | null) {
    const client = await this.prisma.oAuthClient.findUnique({
      where: { clientId },
    });
    if (!client) {
      throw new NotFoundException('OAuth client not found');
    }
    if (tenantId !== null && client.tenantId !== tenantId) {
      throw new ForbiddenException('Access denied');
    }
    return client;
  }

  /**
   * Block mutating operations on a revoked client. The `OAuthClient` model
   * doesn't have a dedicated `revokedAt` column; `revoke()` flips
   * `isActive=false` and cascade-revokes refresh tokens. So "revoked"
   * means `isActive=false AND at least one refresh token was revoked".
   * Pause also flips `isActive=false` but touches no tokens, so we can
   * distinguish the two states.
   */
  private async assertNotRevoked(client: { id: number; isActive: boolean }): Promise<void> {
    if (client.isActive) return;
    const revokedTokenCount = await this.prisma.oAuthRefreshToken.count({
      where: { clientId: client.id, revokedAt: { not: null } },
    });
    if (revokedTokenCount > 0) {
      throw new BadRequestException('Cannot modify a revoked OAuth client. Register a new one.');
    }
  }

  private assertScopesAreGrantable(scopes: AgentScope[]): void {
    const forbidden = scopes.filter((s) => (NEVER_EXTERNAL_SCOPES as readonly string[]).includes(s));
    if (forbidden.length > 0) {
      throw new BadRequestException(`These scopes cannot be granted to OAuth clients: ${forbidden.join(', ')}`);
    }
  }

  /** Invalidate the OAuth clients list cache. */
  private async invalidateOAuthClientsCache(tenantId: number | null): Promise<void> {
    await this.cache.del(buildKey('sally:oauth', 'clients', String(tenantId ?? 'global')));
  }
}
