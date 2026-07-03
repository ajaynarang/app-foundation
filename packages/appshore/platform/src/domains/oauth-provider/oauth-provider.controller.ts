import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Public } from '../../auth/decorators/public.decorator';
import { SkipThrottle } from '@nestjs/throttler';
import { Throttle } from '@nestjs/throttler';
import { OAuthProviderService } from './oauth-provider.service';
import { OAuthClientsService } from './oauth-clients.service';
import { OAUTH_SCOPES } from '@app/shared-types';
import { PrismaService } from '../../infrastructure/database/prisma.service';

/**
 * Extract the tenant subdomain from a hostname.
 * Returns null when the host is bare (apex), localhost, an IP, or a known
 * dev tunnel — i.e. anything where subdomain ≠ tenant slug.
 */
function extractTenantSubdomain(hostname: string | undefined): string | null {
  if (!hostname) return null;
  const host = hostname.toLowerCase();

  // Localhost / IP / dev tunnels carry no tenant binding.
  if (host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
  if (host.endsWith('.trycloudflare.com')) return null;
  if (host.endsWith('.ngrok-free.app') || host.endsWith('.ngrok.io')) {
    return null;
  }

  const parts = host.split('.');
  // Need at least <sub>.<root>.<tld> — apex domains have no tenant subdomain.
  if (parts.length < 3) return null;

  const sub = parts[0];
  // Marketing/system subdomains aren't tenants.
  if (sub === 'www' || sub === 'api' || sub === 'app' || sub === 'console') {
    return null;
  }
  return sub;
}

@ApiTags('OAuth')
@Controller('oauth')
export class OAuthProviderController {
  constructor(
    private readonly oauthService: OAuthProviderService,
    private readonly oauthClientsService: OAuthClientsService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * GET /oauth/authorize — Validates request, returns redirect to consent page.
   */
  @Get('authorize')
  @Public()
  @SkipThrottle()
  @ApiOperation({ summary: 'OAuth 2.1 authorization endpoint' })
  async authorize(
    @Query('response_type') responseType: string,
    @Query('client_id') clientId: string,
    @Query('redirect_uri') redirectUri: string,
    @Query('scope') scope: string,
    @Query('state') state: string,
    @Query('code_challenge') codeChallenge: string,
    @Query('code_challenge_method') codeChallengeMethod: string,
    @Res() res: Response,
  ) {
    // Validate required params
    if (responseType !== 'code') {
      throw new BadRequestException('response_type must be "code"');
    }
    if (!clientId || !redirectUri || !scope || !state) {
      throw new BadRequestException('Missing required parameters');
    }
    if (!codeChallenge || codeChallengeMethod !== 'S256') {
      throw new BadRequestException('PKCE with S256 is required');
    }

    const challengeToken = await this.oauthService.authorize({
      responseType,
      clientId,
      redirectUri,
      scope,
      state,
      codeChallenge,
      codeChallengeMethod,
    });

    // Redirect to frontend consent page
    const frontendUrl = process.env.APP_URL || 'http://localhost:3000';
    const consentUrl = `${frontendUrl}/oauth/consent?challenge=${encodeURIComponent(challengeToken)}`;

    res.redirect(302, consentUrl);
  }

  /**
   * POST /oauth/authorize/consent — User approves consent.
   * Requires JWT auth (logged-in user).
   */
  @Post('authorize/consent')
  @ApiOperation({ summary: 'Approve OAuth consent' })
  async approveConsent(
    @Body('challenge') challenge: string,
    @Body('selectedScopes') selectedScopes: string[] | undefined,
    @Req() req: Request,
  ) {
    if (!challenge) {
      throw new BadRequestException('Missing challenge token');
    }
    if (selectedScopes !== undefined) {
      if (!Array.isArray(selectedScopes) || !selectedScopes.every((s) => typeof s === 'string')) {
        throw new BadRequestException('selectedScopes must be an array of strings when provided');
      }
    }
    const user = (req as any).user;
    return this.oauthService.approveConsent(challenge, user.dbId, user.tenantDbId ?? null, selectedScopes);
  }

  /**
   * POST /oauth/token — Token exchange.
   * Rate limited: 10 req/min per IP (targets brute-force).
   */
  @Post('token')
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'OAuth 2.1 token endpoint' })
  async token(
    @Body('grant_type') grantType: string,
    @Body('code') code: string,
    @Body('redirect_uri') redirectUri: string,
    @Body('client_id') clientId: string,
    @Body('client_secret') clientSecret: string,
    @Body('code_verifier') codeVerifier: string,
    @Body('refresh_token') refreshToken: string,
  ) {
    if (grantType === 'authorization_code') {
      if (!code || !clientId || !codeVerifier || !redirectUri) {
        throw new BadRequestException('Missing required parameters');
      }
      return this.oauthService.exchangeCode(code, codeVerifier, clientId, clientSecret, redirectUri);
    }

    if (grantType === 'refresh_token') {
      if (!refreshToken || !clientId) {
        throw new BadRequestException('Missing required parameters');
      }
      return this.oauthService.refreshToken(refreshToken, clientId, clientSecret);
    }

    // RFC 6749 Section 5.2: errors use 400
    throw new BadRequestException({
      error: 'unsupported_grant_type',
      error_description: 'Only authorization_code and refresh_token are supported',
    });
  }

  /**
   * POST /oauth/revoke — Token revocation (RFC 7009).
   * Rate limited to prevent abuse.
   */
  @Post('revoke')
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'OAuth 2.1 token revocation' })
  async revoke(@Body('token') token: string) {
    if (!token) {
      throw new BadRequestException('Missing token');
    }
    await this.oauthService.revokeToken(token);
    return {};
  }

  /**
   * POST /oauth/register — Dynamic Client Registration (RFC 7591).
   * Public endpoint, rate-limited. Allows MCP clients like Claude Desktop
   * to self-register without manual setup.
   */
  @Post('register')
  @Public()
  @SkipThrottle()
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'OAuth 2.1 Dynamic Client Registration (RFC 7591)' })
  async register(@Body() body: Record<string, any>, @Req() req: Request) {
    const clientName = body.client_name;
    if (!clientName || typeof clientName !== 'string') {
      throw new BadRequestException({
        error: 'invalid_client_metadata',
        error_description: 'client_name is required',
      });
    }

    const redirectUris = body.redirect_uris;
    if (
      !Array.isArray(redirectUris) ||
      redirectUris.length === 0 ||
      !redirectUris.every((u: unknown) => typeof u === 'string')
    ) {
      throw new BadRequestException({
        error: 'invalid_client_metadata',
        error_description: 'redirect_uris must be a non-empty array of strings',
      });
    }

    // Validate redirect URIs: must be localhost or HTTPS (per MCP spec)
    for (const uri of redirectUris) {
      try {
        const parsed = new URL(uri);
        const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
        if (!isLocalhost && parsed.protocol !== 'https:') {
          throw new BadRequestException({
            error: 'invalid_client_metadata',
            error_description: 'redirect_uris must use HTTPS or be localhost URLs',
          });
        }
      } catch (e) {
        if (e instanceof BadRequestException) throw e;
        throw new BadRequestException({
          error: 'invalid_client_metadata',
          error_description: `Invalid redirect_uri: ${uri}`,
        });
      }
    }

    // Requested scopes — default to all available scopes if not specified
    // MCP clients (Claude, ChatGPT) often omit scopes during DCR and rely on
    // the scopes_supported from /.well-known/oauth-authorization-server metadata.
    // Granting all scopes here is safe because the user still approves on the consent page.
    const requestedScope = body.scope;
    const scopes = requestedScope ? String(requestedScope).split(' ').filter(Boolean) : [...OAUTH_SCOPES];

    // Determine grant types — default to authorization_code
    const grantTypes = body.grant_types ?? ['authorization_code'];

    // Token endpoint auth method determines client type
    const tokenEndpointAuthMethod = body.token_endpoint_auth_method ?? 'none';
    const clientType = tokenEndpointAuthMethod === 'none' ? 'public' : 'confidential';

    // Tenant binding strategy:
    //   1. Subdomain (production) — `acme.example.com/oauth/register`
    //      binds the client to the Acme tenant at registration. Clean, no race.
    //   2. Fallback to first-authorizer adoption (handled in
    //      OAuthProviderService.approveConsent) — the first user to consent
    //      adopts the tenantless client into their tenant. Used for local
    //      dev, dev tunnels, and apex-domain access.
    const subdomain = extractTenantSubdomain(req.hostname);
    let tenantId: number | null = null;
    if (subdomain) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { subdomain },
        select: { id: true, status: true },
      });
      if (tenant && tenant.status === 'ACTIVE') {
        tenantId = tenant.id;
      }
    }

    const created = await this.oauthClientsService.create(
      {
        name: clientName,
        description: body.client_uri ?? null,
        redirectUris,
        scopes: scopes as any,
        clientType,
      },
      null, // no user for DCR — createdByUserId is nullable
      tenantId,
    );

    // RFC 7591 response format (snake_case per spec)
    const response: Record<string, any> = {
      client_id: created.clientId,
      client_name: clientName,
      redirect_uris: redirectUris,
      grant_types: grantTypes,
      token_endpoint_auth_method: tokenEndpointAuthMethod,
      scope: scopes.join(' '),
      client_id_issued_at: Math.floor(Date.now() / 1000),
    };

    // Only include client_secret for confidential clients
    if (clientType === 'confidential') {
      response.client_secret = created.clientSecret;
      response.client_secret_expires_at = 0; // never expires
    }

    return response;
  }
}
