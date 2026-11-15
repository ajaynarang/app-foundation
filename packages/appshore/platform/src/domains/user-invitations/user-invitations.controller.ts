import { Controller, Post, Get, Delete, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { UserInvitationsService } from './user-invitations.service';
import { AuthService } from '../../auth/auth.service';
import {
  InviteUserDto,
  AcceptInvitationDto,
  AcceptPhoneInvitationDto,
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
import { InvitationLink, InvitationList, InvitationListEntry, InvitationPreview } from './openapi.responses';
import { RLS_SOURCE, runAsTenant } from '@appshore/kernel/infrastructure/rls/rls-context';
import { AUTH_THROTTLE_LIMIT_OTP_SEND, AUTH_THROTTLE_TTL_MS } from '../../constants';
import { UserProfileDto } from '../../auth/dto/login.dto';
import { toUserProfile } from '../../auth/user-profile';

const INVITATION_ID_PARAM = { name: 'invitation_id', description: 'Invitation public id (inv_…)' };

/**
 * The public token routes. A token is about 165 bits, so a strict limit adds nothing against guessing; this one still
 * bounds a client, and leaves room for a person who reloads the acceptance page.
 */
const TOKEN_ROUTE_THROTTLE = { default: { ttl: AUTH_THROTTLE_TTL_MS, limit: AUTH_THROTTLE_LIMIT_OTP_SEND } };

@Controller('invitations')
export class UserInvitationsController {
  constructor(
    private readonly userInvitationsService: UserInvitationsService,
    private readonly authService: AuthService,
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
   * Accept invitation (PUBLIC). Answers the account's public profile, never its row.
   */
  @Public()
  @Throttle(TOKEN_ROUTE_THROTTLE)
  @Post('accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept an email invitation with a Firebase identity (public)' })
  @ApiResult(UserProfileDto)
  async acceptInvitation(@Body() dto: AcceptInvitationDto): Promise<UserProfileDto> {
    const user = await this.asInvitationTenant(dto.token, () =>
      this.userInvitationsService.acceptInvitation(dto.token, dto.firebaseUid),
    );
    return toUserProfile(user);
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
   * Accept phone-channel invitation (OTP + PIN setup)
   */
  @Public()
  @Post('accept-phone')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept an SMS invitation — verify the OTP, set a PIN, sign in (public)' })
  async acceptPhoneInvitation(@Body() dto: AcceptPhoneInvitationDto) {
    return this.asInvitationTenant(dto.token, async () => {
      const user = await this.userInvitationsService.acceptPhoneInvitation(dto);
      return this.authService.generateTokensForUser(user);
    });
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
