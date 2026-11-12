import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AppCacheService } from '../../infrastructure/cache/app-cache.service';
import { buildKey } from '@appshore/kernel/infrastructure/cache/cache-key.constants';
import { OutboxService } from '../../infrastructure/events/outbox.service';
import { FOUNDATION_DOMAIN_EVENTS as DOMAIN_EVENTS } from '@appshore/kernel/infrastructure/events/foundation-events';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { nanoid } from 'nanoid';
import { AgentScopeSchema, NEVER_EXTERNAL_SCOPES } from '@app/shared-types';
import type {
  AgentScope,
  CursorList,
  CreateOAuthClientInput,
  UpdateOAuthClientInput,
  OAuthClientResponse,
  OAuthClientCreatedResponse,
} from '@app/shared-types';
import { UpdateOAuthClientScopesDto } from './dto/update-oauth-client-scopes.dto';
import { invalidState } from '@appshore/kernel/shared/errors/api-errors';
import type { Prisma } from '@appshore/db';
import {
  buildCursorPage,
  clampCursorLimit,
  encodeCursor,
  keysetWhere,
} from '@appshore/kernel/shared/utils/cursor-pagination';

const OAUTH_CLIENT_KEYSET = { field: 'createdAt', idField: 'clientId', kind: 'date', direction: 'desc' } as const;

/** `GET /oauth/clients`. */
export interface OAuthClientListQuery {
  limit?: number;
  cursor?: string;
}

@Injectable()
export class OAuthClientsService {
  private readonly logger = new Logger(OAuthClientsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: AppCacheService,
    // Events commit with the write (ADR "Outbox and deadlines").
    private readonly outbox: OutboxService,
  ) {}

  async create(
    input: CreateOAuthClientInput,
    userId: number | null,
    tenantId: number | null,
  ): Promise<OAuthClientCreatedResponse> {
    this.assertScopesAreGrantable(input.scopes);

    const clientIdValue = `app_${nanoid(32)}`;
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

  /**
   * A workspace's OAuth clients (the global ones for a super admin), newest first, as a cursor list. The
   * tiebreak is the public `clientId`, never the Int key.
   */
  async findAll(tenantId: number | null, query: OAuthClientListQuery = {}): Promise<CursorList<OAuthClientResponse>> {
    const take = clampCursorLimit(query.limit);
    // Decoded before any query runs: a malformed cursor is a 400 and costs nothing.
    const keyset = query.cursor ? keysetWhere({ ...OAUTH_CLIENT_KEYSET, cursor: query.cursor }) : undefined;
    const scope: Prisma.OAuthClientWhereInput = tenantId ? { tenantId } : { tenantId: null };
    const [rows, total] = await Promise.all([
      this.prisma.oAuthClient.findMany({
        where: keyset ? { AND: [scope, keyset] } : scope,
        orderBy: [{ createdAt: 'desc' }, { clientId: 'desc' }],
        take: take + 1,
      }),
      this.prisma.oAuthClient.count({ where: scope }),
    ]);
    const page = buildCursorPage(rows, take, (row) => encodeCursor(row.createdAt, row.clientId));
    const items = page.items.map((c) => ({
      clientId: c.clientId,
      name: c.name,
      description: c.description,
      redirectUris: c.redirectUris,
      scopes: c.scopes,
      clientType: c.clientType,
      isActive: c.isActive,
      createdAt: c.createdAt.toISOString(),
    }));
    return { items, nextCursor: page.nextCursor, total };
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
      this.assertScopesAreGrantable(input.scopes);
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

    await this.outbox.transaction(async (tx, emit) => {
      await tx.oAuthAccessToken.updateMany({
        where: { clientId: client.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.oAuthRefreshToken.updateMany({
        where: { clientId: client.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.oAuthClient.update({
        where: { clientId },
        data: { isActive: false },
      });
      await emit(DOMAIN_EVENTS.OAUTH_CLIENT_REVOKED, String(tenantId ?? 'global'), {
        clientId: client.clientId,
        name: client.name,
      });
    });

    await this.invalidateOAuthClientsCache(tenantId);
  }

  /** Toggle isActive=false without cascading token revocation. Reversible via resume. */
  async pause(clientId: string, tenantId: number | null): Promise<void> {
    const client = await this.loadClientOrThrow(clientId, tenantId);
    await this.assertNotRevoked(client);
    if (!client.isActive) {
      throw invalidState('This app is already paused');
    }
    await this.outbox.transaction(async (tx, emit) => {
      await tx.oAuthClient.update({
        where: { clientId },
        data: { isActive: false },
      });
      await emit(DOMAIN_EVENTS.OAUTH_CLIENT_PAUSED, String(tenantId ?? 'global'), {
        clientId: client.clientId,
        name: client.name,
      });
    });
    await this.invalidateOAuthClientsCache(tenantId);
  }

  async resume(clientId: string, tenantId: number | null): Promise<void> {
    const client = await this.loadClientOrThrow(clientId, tenantId);
    await this.assertNotRevoked(client);
    if (client.isActive) {
      throw invalidState('This app is already active');
    }
    await this.outbox.transaction(async (tx, emit) => {
      await tx.oAuthClient.update({
        where: { clientId },
        data: { isActive: true },
      });
      await emit(DOMAIN_EVENTS.OAUTH_CLIENT_RESUMED, String(tenantId ?? 'global'), {
        clientId: client.clientId,
        name: client.name,
      });
    });
    await this.invalidateOAuthClientsCache(tenantId);
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

    await this.outbox.transaction(async (tx, emit) => {
      await tx.oAuthClient.update({
        where: { clientId },
        data: { clientSecret: hashedSecret },
      });
      await emit(DOMAIN_EVENTS.OAUTH_CLIENT_ROTATED, String(tenantId ?? 'global'), {
        clientId: client.clientId,
        name: client.name,
      });
    });

    await this.invalidateOAuthClientsCache(tenantId);

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

    const updated = await this.outbox.transaction(async (tx, emit) => {
      const row = await tx.oAuthClient.update({
        where: { clientId },
        data: { scopes: dto.scopes },
      });
      await emit(DOMAIN_EVENTS.OAUTH_CLIENT_SCOPES_UPDATED, String(tenantId ?? 'global'), {
        clientId: client.clientId,
        name: client.name,
        scopes: dto.scopes,
      });
      return row;
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

  private async loadClientOrThrow(clientId: string, tenantId: number | null) {
    const client = await this.prisma.oAuthClient.findUnique({
      where: { clientId },
    });
    if (!client) {
      throw new NotFoundException('OAuth client not found');
    }
    if (tenantId !== null && client.tenantId !== tenantId) {
      // Another workspace's client answers as a missing one: a 403 would confirm it exists.
      throw new NotFoundException('OAuth client not found');
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
      throw invalidState('This app has been revoked and can no longer be changed. Register it again.');
    }
  }

  private assertScopesAreGrantable(scopes: AgentScope[]): void {
    const forbidden = scopes.filter((s) => (NEVER_EXTERNAL_SCOPES as readonly string[]).includes(s));
    if (forbidden.length > 0) {
      throw new BadRequestException(`These scopes cannot be granted to OAuth clients: ${forbidden.join(', ')}`);
    }
  }

  /** Clears the key the client list was cached under before it became a cursor list; nothing fills it now. */
  private async invalidateOAuthClientsCache(tenantId: number | null): Promise<void> {
    await this.cache.del(buildKey('app:oauth', 'clients', String(tenantId ?? 'global')));
  }
}
