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
  async inviteUser(@Body() dto: InviteUserDto, @CurrentUser() currentUser: any) {
    return this.userInvitationsService.inviteUser(dto, currentUser);
  }

  /**
   * Get all invitations for tenant (OWNER and ADMIN only)
   * SUPER_ADMIN manages tenants, not individual users
   */
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Get()
  async getInvitations(@CurrentUser() currentUser: any, @Query() query: InvitationListQueryDto) {
    return this.userInvitationsService.getInvitations(currentUser.tenantId, query.status);
  }

  /**
   * Get invitation details by token (PUBLIC - for acceptance page)
   */
  @Public()
  @Get('by-token/:token')
  async getInvitationByToken(@Param('token') token: string) {
    return this.userInvitationsService.getInvitationByToken(token);
  }

  /**
   * Accept invitation (PUBLIC)
   */
  @Public()
  @Post('accept')
  @HttpCode(HttpStatus.OK)
  async acceptInvitation(@Body() dto: AcceptInvitationDto) {
    return this.userInvitationsService.acceptInvitation(dto.token, dto.firebaseUid);
  }

  /**
   * Cancel invitation (OWNER and ADMIN)
   */
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Delete(':invitation_id')
  @HttpCode(HttpStatus.NO_CONTENT)
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
  async getInvitationLink(@Param('invitation_id') invitationId: string, @CurrentUser() currentUser: any) {
    return this.userInvitationsService.getInvitationLink(invitationId, currentUser.tenantId);
  }

  /**
   * Resend invitation with new token (OWNER and ADMIN)
   */
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Post(':invitation_id/resend')
  @HttpCode(HttpStatus.OK)
  async resendInvitation(@Param('invitation_id') invitationId: string, @CurrentUser() currentUser: any) {
    return this.userInvitationsService.resendInvitation(invitationId, currentUser.tenantId);
  }

  /**
   * Accept phone-channel invitation (OTP + PIN setup)
   */
  @Public()
  @Post('accept-phone')
  @HttpCode(HttpStatus.OK)
  async acceptPhoneInvitation(@Body() dto: AcceptPhoneInvitationDto) {
    const user = await this.userInvitationsService.acceptPhoneInvitation(dto);
    return this.authService.generateTokensForUser(user);
  }
}
