import { Controller, Post, Get, Delete, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { UserInvitationsService } from './user-invitations.service';
import { AuthService } from '../../auth/auth.service';
import { InviteUserDto, AcceptInvitationDto, AcceptPhoneInvitationDto } from './dto/invite-user.dto';
import { CancelInvitationDto } from './dto/cancel-invitation.dto';
import { InvitationListQueryDto } from './dto/invitation-list-query.dto';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UserRole } from '@appshore/db';
import { ApiNoContentResponse, ApiOperation, ApiParam } from '@nestjs/swagger';
import { ApiResult } from '../../shared/openapi/api-result';
import { InvitationIssued, InvitationLink, InvitationList } from './openapi.responses';

const INVITATION_ID_PARAM = { name: 'invitation_id', description: 'Invitation public id (inv_…)' };

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
  @ApiOperation({ summary: 'Invite a person to the workspace by email or SMS; answers the invitation and its link' })
  @ApiResult(InvitationIssued, HttpStatus.CREATED)
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
   * Get invitation details by token (PUBLIC - for acceptance page)
   */
  @Public()
  @Get('by-token/:token')
  @ApiOperation({ summary: 'Read a pending invitation by its token (public — the acceptance page)' })
  @ApiParam({ name: 'token', description: 'Invitation acceptance token (from the invite link)' })
  async getInvitationByToken(@Param('token') token: string) {
    return this.userInvitationsService.getInvitationByToken(token);
  }

  /**
   * Accept invitation (PUBLIC)
   */
  @Public()
  @Post('accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept an email invitation with a Firebase identity (public)' })
  async acceptInvitation(@Body() dto: AcceptInvitationDto) {
    return this.userInvitationsService.acceptInvitation(dto.token, dto.firebaseUid);
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
   * Get invite link for an existing pending invitation (OWNER, ADMIN, MEMBER)
   */
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @Get(':invitation_id/link')
  @ApiOperation({ summary: 'Get the shareable link of a pending invitation (token unchanged)' })
  @ApiParam(INVITATION_ID_PARAM)
  @ApiResult(InvitationLink)
  async getInvitationLink(@Param('invitation_id') invitationId: string, @CurrentUser() currentUser: any) {
    return this.userInvitationsService.getInvitationLink(invitationId, currentUser.tenantId);
  }

  /**
   * Resend invitation with new token (OWNER and ADMIN)
   */
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Post(':invitation_id/resend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend a pending invitation with a new token and expiry (OWNER/ADMIN)' })
  @ApiParam(INVITATION_ID_PARAM)
  @ApiResult(InvitationIssued)
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
    const user = await this.userInvitationsService.acceptPhoneInvitation(dto);
    return this.authService.generateTokensForUser(user);
  }
}
