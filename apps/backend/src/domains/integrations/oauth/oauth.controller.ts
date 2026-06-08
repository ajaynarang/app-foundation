import { Controller, Get, Post, Param, Query, Req, Res, Logger, BadRequestException } from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../../../auth/decorators/public.decorator';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { BaseTenantController } from '../../../shared/base/base-tenant.controller';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { AuthTokenService } from './auth-token.service';
import { OAuthTokenRefreshJob } from './oauth-token-refresh.job';
import { VENDOR_REGISTRY, getVendorOAuth } from '../vendor-registry';

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
      throw new BadRequestException(`Vendor ${vendor} does not support OAuth`);
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
  @Public()
  async callback(@Query('code') code: string, @Query('state') state: string, @Req() req: any, @Res() res: Response) {
    const consoleUrl = this.config.get<string>('CONSOLE_URL', 'http://localhost:3002');

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

      res.redirect(`${consoleUrl}/integrations/connections?oauth=connected&vendor=${vendor}`);
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

      res.redirect(`${consoleUrl}/integrations/connections?oauth=error&vendor=${vendor}`);
    }
  }

  /**
   * POST /integrations/oauth/:vendor/disconnect
   * Revokes OAuth tokens and clears credentials.
   */
  @Post(':vendor/disconnect')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  async disconnect(@Param('vendor') vendor: string, @CurrentUser() user: any) {
    const vendorMeta = VENDOR_REGISTRY[vendor];
    if (!vendorMeta || !getVendorOAuth(vendorMeta)) {
      throw new BadRequestException(`Vendor ${vendor} does not support OAuth`);
    }

    const tenantDbId = await this.getTenantDbId(user);
    await this.authTokenService.disconnect(vendor, tenantDbId);
    await this.tokenRefreshJob.removeForIntegration(vendor, tenantDbId);
    return { success: true, message: `${vendor} disconnected` };
  }
}
