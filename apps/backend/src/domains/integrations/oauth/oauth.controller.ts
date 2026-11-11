import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Req,
  Res,
  Logger,
  BadRequestException,
  NotFoundException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { Public } from '@appshore/platform/auth/decorators/public.decorator';
import { CurrentUser } from '@appshore/platform/auth/decorators/current-user.decorator';
import { Roles } from '@appshore/platform/auth/decorators/roles.decorator';
import { UserRole } from '@appshore/db';
import { BaseTenantController } from '@appshore/platform/shared/base/base-tenant.controller';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { AuthTokenService } from './auth-token.service';
import { OAuthTokenRefreshJob } from './oauth-token-refresh.job';
import { VENDOR_REGISTRY, getVendorOAuth } from '../vendor-registry';
import { INTEGRATIONS_WEB_PATH } from '../../../shared/web-routes';
import { ApiExcludeEndpoint } from '@nestjs/swagger';

@Controller('integrations/oauth')
export class OAuthController extends BaseTenantController {
  private readonly logger = new Logger(OAuthController.name);

  constructor(
    prisma: PrismaService,
    private readonly authTokenService: AuthTokenService,
    private readonly tokenRefreshJob: OAuthTokenRefreshJob,
    private readonly config: ConfigService,
  ) {
    super(prisma);
  }

  /**
   * GET /integrations/oauth/:vendor/connect
   * Returns the OAuth authorization URL for the given vendor.
   */
  @Get(':vendor/connect')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  async connect(@Param('vendor') vendor: string, @CurrentUser() user: any) {
    const vendorMeta = VENDOR_REGISTRY[vendor];
    const oauthConfig = vendorMeta ? getVendorOAuth(vendorMeta) : undefined;
    if (!oauthConfig) {
      throw new NotFoundException('This integration does not connect with OAuth');
    }

    const tenantDbId = await this.getTenantDbId(user);
    return this.authTokenService.getConnectUrl(vendor, tenantDbId);
  }

  /**
   * GET /integrations/oauth/callback
   * Handles OAuth redirect from any vendor.
   * Public because the user's browser is redirected here from the vendor.
   */
  @Get('callback')
  // A browser redirect whose query the vendor writes: not part of the published contract.
  @ApiExcludeEndpoint()
  @Public()
  async callback(@Query('code') code: string, @Query('state') state: string, @Req() req: any, @Res() res: Response) {
    // The browser returns to the web app: APP_URL is the origin every other web link uses.
    const appUrl = (this.config.get<string>('APP_URL') || 'http://localhost:3000').replace(/\/$/, '');
    const returnTo = `${appUrl}${INTEGRATIONS_WEB_PATH}`;

    try {
      if (!code || !state) {
        throw new BadRequestException('Missing code or state parameter');
      }

      // Collect all query params beyond code/state (vendor-specific extras)
      const extraParams: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.query)) {
        if (key !== 'code' && key !== 'state' && typeof value === 'string') {
          extraParams[key] = value;
        }
      }

      const { vendor, tenantId } = await this.authTokenService.handleCallback(code, state, extraParams);

      // Register token refresh job for this integration
      const vendorMeta = VENDOR_REGISTRY[vendor];
      const oauthConfig = vendorMeta ? getVendorOAuth(vendorMeta) : undefined;
      if (oauthConfig) {
        const integrationConfig = await this.prisma.integrationConfig.findFirst({
          where: { tenantId, vendor: vendor as any, isEnabled: true },
          select: { integrationId: true },
        });
        if (integrationConfig) {
          await this.tokenRefreshJob.registerForIntegration(
            tenantId,
            integrationConfig.integrationId,
            vendor,
            oauthConfig.tokenExpirySeconds,
          );
        }
      }

      res.redirect(`${returnTo}?oauth=connected&vendor=${encodeURIComponent(vendor)}`);
    } catch (err) {
      this.logger.error(`OAuth callback failed: ${(err as Error).message}`);

      // Try to extract vendor from state for error redirect
      let vendor = 'unknown';
      try {
        const decoded = JSON.parse(Buffer.from(state, 'base64').toString());
        vendor = decoded.vendor ?? 'unknown';
      } catch {
        /* ignore */
      }

      res.redirect(`${returnTo}?oauth=error&vendor=${encodeURIComponent(vendor)}`);
    }
  }

  /**
   * POST /integrations/oauth/:vendor/disconnect
   * Revokes OAuth tokens and clears credentials.
   */
  @Post(':vendor/disconnect')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  async disconnect(@Param('vendor') vendor: string, @CurrentUser() user: any): Promise<void> {
    const vendorMeta = VENDOR_REGISTRY[vendor];
    if (!vendorMeta || !getVendorOAuth(vendorMeta)) {
      throw new NotFoundException('This integration does not connect with OAuth');
    }

    const tenantDbId = await this.getTenantDbId(user);
    await this.authTokenService.disconnect(vendor, tenantDbId);
    await this.tokenRefreshJob.removeForIntegration(vendor, tenantDbId);
  }
}
