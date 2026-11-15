import { Controller, Post, Get, Delete, Body, Param, Query, HttpCode, HttpStatus, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { UserInvitationsService } from './user-invitations.service';
import { AuthService } from '../../auth/auth.service';
import {
  InviteUserDto,
  AcceptInvitationDto,
  AcceptPhoneInvitationDto,
  JoinInvitationDto,
  PreviewInvitationDto,
} from './dto/invite-user.dto';
import { CancelInvitationDto } from './dto/cancel-invitation.dto';
import { InvitationListQueryDto } from './dto/invitation-list-query.dto';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UserRole } from '@appshore/db';
import { ApiNoContentResponse, ApiOperation, ApiParam } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ApiResult } from '../../shared/openapi/api-result';
import {
  InvitationJoined,
  InvitationLink,
  InvitationList,
  InvitationListEntry,
  InvitationPreview,
} from './openapi.responses';
import { RLS_SOURCE, runAsInvitationTenant, runAsTenant } from '@appshore/kernel/infrastructure/rls/rls-context';
import { AUTH_THROTTLE_LIMIT_STRICT, AUTH_THROTTLE_LIMIT_TOKEN, AUTH_THROTTLE_TTL_MS } from '../../constants';
import { LoginResponseDto } from '../../auth/dto/login.dto';
import { setRefreshTokenCookie } from '../../auth/refresh-token-cookie';
import { NotFoundException } from '@nestjs/common';

const INVITATION_ID_PARAM = { name: 'invitation_id', description: 'Invitation public id (inv_…)' };

/**
 * The public token routes. A token is about 165 bits, so a strict limit adds nothing against guessing; this one still
 * bounds a client, and leaves room for a person who reloads the acceptance page (AUTH_THROTTLE_LIMIT_TOKEN).
 */
const TOKEN_ROUTE_THROTTLE = { default: { ttl: AUTH_THROTTLE_TTL_MS, limit: AUTH_THROTTLE_LIMIT_TOKEN } };

/** `POST /invitations/join`: signed in, so counted per user; STRICT, as every other credential-shaped write. */
const JOIN_THROTTLE = { default: { ttl: AUTH_THROTTLE_TTL_MS, limit: AUTH_THROTTLE_LIMIT_STRICT } };

/** Who asked, for the login event. */
const requestMeta = (req: Request) => ({ ip: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null });

@Controller('invitations')
export class UserInvitationsController {
  constructor(
    private readonly userInvitationsService: UserInvitationsService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Invite a new user (OWNER and ADMIN)
   * SUPER_ADMIN manages tenants through tenant registration, not user invitations
   */
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Invite a person to the workspace by email or SMS; answers the invitation (the link goes to the invitee only)',
  })
  @ApiResult(InvitationListEntry, HttpStatus.CREATED)
  async inviteUser(@Body() dto: InviteUserDto, @CurrentUser() currentUser: any) {
    return this.userInvitationsService.inviteUser(dto, currentUser);
  }

  /**
   * Get all invitations for tenant (OWNER and ADMIN only)
   * SUPER_ADMIN manages tenants, not individual users
   */
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Get()
  @ApiOperation({ summary: "List the workspace's invitations, newest first (cursor-paged; never the token)" })
  @ApiResult(InvitationList)
  async getInvitations(@CurrentUser() currentUser: any, @Query() query: InvitationListQueryDto) {
    return this.userInvitationsService.listInvitations(currentUser.tenantId, query);
  }

  /**
   * What the acceptance page shows (PUBLIC). The token is in the body, never the path, so it stays out of the
   * request log.
   */
  @Public()
  @Throttle(TOKEN_ROUTE_THROTTLE)
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Read a pending invitation by its token, sent in the body (public — the acceptance page)' })
  @ApiResult(InvitationPreview)
  async previewInvitation(@Body() dto: PreviewInvitationDto) {
    return this.asInvitationTenant(dto.token, () => this.userInvitationsService.previewInvitation(dto.token));
  }

  /**
   * Accept an email invitation as a NEW account (PUBLIC), with a password or a verified Firebase ID token, and sign
   * in. An email that already has an account is 409 SIGN_IN_TO_ACCEPT: sign in, then `POST /invitations/join`.
   */
  @Public()
  @Throttle(TOKEN_ROUTE_THROTTLE)
  @Post('accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Accept an email invitation as a new account with a password or a Firebase ID token, and sign in (public); 409 SIGN_IN_TO_ACCEPT when the email already has an account',
  })
  @ApiResult(LoginResponseDto)
  async acceptInvitation(
    @Body() dto: AcceptInvitationDto,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponseDto> {
    const session = await this.asInvitationTenant(dto.token, async () => {
      const user = await this.userInvitationsService.acceptInvitation(dto);
      // Both paths stamp email_password, as the Firebase exchange does: the AuthMethod union has no Firebase entry.
      return this.authService.startSession(user.id, 'email_password', requestMeta(req));
    });
    return this.signedIn(response, session);
  }

  /**
   * Join the invitation's workspace as the signed-in account (any role). JWT session only: no OAuth or API-key guard
   * sits on this route, so an agent never joins a workspace for a user. The account's email must be the invitation's;
   * an unverified one joins too, and is verified when the token travelled by email alone. Issues no session: the client switches with `POST /workspaces/switch`.
   */
  @Throttle(JOIN_THROTTLE)
  @Post('join')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Join the invitation's workspace as the signed-in account; its email must be the invitation's (403 INVITATION_EMAIL_MISMATCH). An emailed-only token also verifies the email",
  })
  @ApiResult(InvitationJoined)
  async joinInvitation(@Body() dto: JoinInvitationDto, @CurrentUser() currentUser: any) {
    const tenantDbId = await this.userInvitationsService.tenantDbIdForToken(dto.token);
    if (tenantDbId === null) throw new NotFoundException('Invitation not found or invalid');
    return runAsInvitationTenant(tenantDbId, () =>
      this.userInvitationsService.joinInvitation(dto.token, currentUser.dbId),
    );
  }

  /**
   * Cancel invitation (OWNER and ADMIN)
   */
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Delete(':invitation_id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancel a pending invitation (OWNER/ADMIN)' })
  @ApiParam(INVITATION_ID_PARAM)
  @ApiNoContentResponse({ description: 'Invitation cancelled' })
  async cancelInvitation(
    @Param('invitation_id') invitationId: string,
    @CurrentUser() currentUser: any,
    @Body() dto: CancelInvitationDto,
  ): Promise<void> {
    await this.userInvitationsService.cancelInvitation(invitationId, currentUser.tenantId, dto?.reason);
  }

  /**
   * A shareable link for a pending invitation (OWNER and ADMIN). Tokens are stored hashed, so this rotates the token
   * and shows the new link once; the link in the invitation email stops working.
   */
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Post(':invitation_id/link')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Make a new shareable link for a pending invitation, shown once; the emailed link stops working (OWNER/ADMIN)',
  })
  @ApiParam(INVITATION_ID_PARAM)
  @ApiResult(InvitationLink)
  async rotateInvitationLink(@Param('invitation_id') invitationId: string, @CurrentUser() currentUser: any) {
    return this.userInvitationsService.rotateInvitationLink(invitationId, currentUser.tenantId);
  }

  /**
   * Resend invitation with new token (OWNER and ADMIN)
   */
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Post(':invitation_id/resend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend a pending invitation with a new token and expiry (OWNER/ADMIN)' })
  @ApiParam(INVITATION_ID_PARAM)
  @ApiResult(InvitationListEntry)
  async resendInvitation(@Param('invitation_id') invitationId: string, @CurrentUser() currentUser: any) {
    return this.userInvitationsService.resendInvitation(invitationId, currentUser.tenantId);
  }

  /**
   * Accept phone-channel invitation (OTP + PIN setup), and sign in: the refresh token goes in the cookie, not the body.
   */
  @Public()
  @Post('accept-phone')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept an SMS invitation — verify the OTP, set a PIN, sign in (public)' })
  @ApiResult(LoginResponseDto)
  async acceptPhoneInvitation(
    @Body() dto: AcceptPhoneInvitationDto,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponseDto> {
    const session = await this.asInvitationTenant(dto.token, async () => {
      const user = await this.userInvitationsService.acceptPhoneInvitation(dto);
      return this.authService.startSession(user.id, 'phone_otp', requestMeta(req));
    });
    return this.signedIn(response, session);
  }

  /** The refresh token into the host-only cookie (as `POST /auth/login` does), the rest into the body. */
  private signedIn(
    response: Response,
    session: { accessToken: string; refreshToken: string; user: LoginResponseDto['user'] },
  ): LoginResponseDto {
    setRefreshTokenCookie(response, session.refreshToken, {
      secure: this.configService.get<string>('environment') === 'production',
      legacyDomain: this.configService.get<string>('COOKIE_DOMAIN') || undefined,
    });
    return { accessToken: session.accessToken, user: session.user };
  }

  /**
   * A public invitation route runs as the invitation's tenant (rls-context.ts) once its token names one. An unknown
   * token runs with no context, so the service answers it exactly as before.
   */
  private async asInvitationTenant<T>(token: string, fn: () => Promise<T>): Promise<T> {
    const tenantDbId = await this.userInvitationsService.tenantDbIdForToken(token);
    return tenantDbId === null ? fn() : runAsTenant(tenantDbId, RLS_SOURCE.INVITATION, fn);
  }
}
